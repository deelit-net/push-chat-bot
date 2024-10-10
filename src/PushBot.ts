import { PushAPI, SignerType, PushAPIInitializeProps, Message, CONSTANTS } from "@pushprotocol/restapi";
import { PushStream } from "@pushprotocol/restapi/src/lib/pushstream/PushStream";
import { ChatEvent, ChatMessage, CommandHandler, Scope, ScopeData } from "types";
import { createLogger, Logger } from "winston";
import Keyv, { KeyvOptions } from "keyv";
import { MessageType } from "@pushprotocol/restapi/src/lib/constants";

const STREAM_CONNECTION_RETRIES = 10; // 3 retries to connect to the stream
const DEFAULT_SCOPE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Command represents a chat bot command with a route and a handler
 */
class Command {
    route: RegExp;
    handler: CommandHandler;

    constructor(route: RegExp, handler: CommandHandler) {
        this.route = route;
        this.handler = handler;
    }

    match(route: string) {
        return this.route.test(route);
    }
}

/**
 * Router is responsible for routing the messages to the correct command by storing the commands and matching the message with the command route
 */
class Router {
    private _commands: Command[] = [];

    constructor() {}

    addCommand(command: Command) {
        this._commands.push(command);
    }

    route(event: ChatEvent<any>): Command | undefined {
        // Router can only route chat messages
        if (event.event === "chat.message") {
            const chat = event as ChatMessage;
            console.log("handling chat message content", chat.message.content);
            if (chat.message.type === MessageType.TEXT && typeof chat.message.content === "string") {
                return this._commands.find((command) => command.match(chat.message.content as string));
            }
        }

        return undefined;
    }
}

/**
 * ScopeStore is responsible for storing the scopes related to the chat and user.
 * You can use any Keyv adapter to store the scopes in a persistent storage.
 */
class ScopeStore {
    private _keyv: Keyv;

    constructor(options?: { keyvOptions?: KeyvOptions }) {
        this._keyv = new Keyv({ ttl: DEFAULT_SCOPE_TTL, ...options?.keyvOptions });
    }

    async get(key: string): Promise<ScopeData | undefined> {
        return await this._keyv.get<ScopeData>(key);
    }

    async store(scope: ScopeData) {
        await this._keyv.set(ScopeStore._key(scope), scope);
    }

    async delete(scope: Pick<ScopeData, "chatId" | "from">) {
        await this._keyv.delete(ScopeStore._key(scope));
    }

    static _key(scope: Pick<ScopeData, "chatId" | "from">): string {
        return `${scope.chatId}:${scope.from}`;
    }
}

/**
 * Processor is responsible for processing the messages and executing the command handlers
 * It stores the scopes related to the chat and user
 */
class Processor {
    private _router: Router;
    private _scopeStore: ScopeStore;
    private _push: PushAPI;
    private _logger?: Logger;

    constructor(
        push: PushAPI,
        router: Router,
        options?: {
            logger?: Logger;
            keyvOptions?: KeyvOptions;
        }
    ) {
        this._push = push;
        this._router = router;
        this._scopeStore = new ScopeStore({ keyvOptions: options?.keyvOptions });
        this._logger = options?.logger;
    }

    async process(chatId: string, event: ChatEvent<any>) {
        this._logger?.debug(`Processing chat message from ${event.from} on chat ${chatId}`);

        //setup the scope wit a existing scope or create a new one
        const scopeDataStored = await this._scopeStore.get(ScopeStore._key({ chatId: chatId, from: event.from }));
        const scopeData = scopeDataStored
            ? { ...scopeDataStored, event: event, events: [...scopeDataStored.events, event] }
            : {
                  chatId: chatId,
                  from: event.from,
                  event: event,
                  events: [event],
              };
        let scope = this._scope(scopeData);

        // Retrieve the command
        const command = this._router.route(scope.events[0]);

        // If there is a scope stored and no command found, delete the scope
        if (scopeDataStored && !command) {
            this._logger?.warn("No command found for the message with existing scope", {
                chat: chatId,
                from: event.from,
                message: event.raw,
            });
            this._scopeStore.delete(scopeDataStored);
        }

        // If there is a command, execute it
        if (command) {
            this._logger?.debug("Executing command", { chat: chatId, from: event.from, command: command.route });
            command.handler(scope);

            if (scope.isDone) {
                this._logger?.debug("Scope is done", { chat: chatId, from: event.from });
                this._scopeStore.delete(scope);
            } else {
                this._storeScope(scope);
            }
        }
    }

    _scope(scopeData: ScopeData): Scope {
        return {
            ...scopeData,
            isDone: false,
            send: async (message: Message) => {
                this._logger?.debug("Sending message", { chat: scopeData.chatId, to: scopeData.from, message: message.content });
                return await this._push.chat.send(scopeData.chatId, message);
            },
        };
    }

    _storeScope(scope: Scope) {
        this._scopeStore.store(scope);
    }
}

/**
 * PushBot is a chat bot that listens to the chat messages and executes commands based on the message content.
 *
 * Usage:
 *
 * ```typescript
 * import { PushBot } from "push-chat-bot";
 * import { ethers } from "ethers";
 *
 * async function main() {
 *
 *   // Initialize the bot wallet
 *   const wallet = new ethers.Wallet("bot-private-key");
 *
 *   // Initialize the bot
 *   const bot = await PushBot.initialize(wallet);
 *
 *   // Register the bot commands
 *
 *   bot.command(/\/ping/, ($: Scope) => {
 *     $.send({ type: "Text", content: "Pong!" });
 *     $.isDone = true;
 *   });
 *
 *   // Start the bot
 *   await bot.start();
 * }
 * ```
 */
export class PushBot {
    private _push: PushAPI;
    private _router: Router;
    private _processor: Processor;
    private _stream: PushStream | undefined;
    private _logger: Logger;

    constructor(pushApi: PushAPI, logger?: Logger) {
        this._push = pushApi;
        this._logger = logger ?? createLogger({ defaultMeta: { service: "push-chat-bot" }, level: "info" });
        this._router = new Router();
        this._processor = new Processor(this._push, this._router, { logger: this._logger });
        this._stream = undefined;
    }

    static async initialize(signer: SignerType, options?: PushAPIInitializeProps & { logger?: Logger }): Promise<PushBot> {
        let push = await PushAPI.initialize(signer, options);
        return new PushBot(push, options?.logger);
    }

    get pushAPI() {
        return this._push;
    }

    command(route: RegExp, handler: CommandHandler) {
        this._router.addCommand(new Command(route, handler));
    }

    async start(options?: { acceptRequests?: boolean }) {
        if (options?.acceptRequests) {
            await this._acceptRequests();
        }

        if (!this._stream) {
            this._stream = await this._createStream();
        }

        this._stream.on(CONSTANTS.STREAM.CHAT, async (event: ChatEvent<any>) => {
            this._logger?.debug("Received chat message", JSON.stringify({ event: event.event, chatId: event.chatId, from: event.from }));
            if (event.origin === "other") {
                if (event.event === "chat.request" && options?.acceptRequests) {
                    const chatRequest = event as ChatEvent<"chat.request">;
                    await this._acceptRequest(chatRequest.from);
                } else if (event.event === "chat.message") {
                    this._processor.process(event.chatId, event);
                }
            }
        });

        this._stream.on(CONSTANTS.STREAM.CONNECT, () => {
            this._logger?.info("Push Chat Bot connected to chat stream");
        });

        this._stream.on(CONSTANTS.STREAM.DISCONNECT, () => {
            this._logger?.info("Push Chat Bot diconnected to chat stream");
        });

        try {
            this._stream.connect();
        } catch (error) {
            this._logger?.error("Failed to start chat stream:", error);
            this._stream = undefined;
        }
    }

    async _acceptRequests() {
        this._logger?.debug("Fetching and accepting requests");
        const requests = await this._push.chat.list("REQUESTS");
        for (let request of requests) {
            await this._acceptRequest(request.did);
        }
    }

    async _acceptRequest(chatId: string) {
        this._logger?.debug("Accepting request", { chatId: chatId });
        await this._push.chat.accept(chatId);
    }

    async _createStream(): Promise<PushStream> {
        this._logger?.info("Creating chat stream");
        return await this._push.initStream([CONSTANTS.STREAM.CHAT, CONSTANTS.STREAM.CONNECT, CONSTANTS.STREAM.DISCONNECT], {
            filter: {
                channels: ["*"],
                chats: ["*"],
            },
            connection: {
                retries: STREAM_CONNECTION_RETRIES,
            },
            raw: false,
        });
    }

    async stop() {
        if (this._stream && (await this._stream.connected())) {
            await this._stream.disconnect();
        }
        this._stream = undefined;
    }
}
