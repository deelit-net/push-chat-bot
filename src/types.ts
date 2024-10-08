import { Message, MessageWithCID } from "@pushprotocol/restapi";

export type ChatHistory = {
    fromCAIP10: string;
    toCAIP10: string;
    fromDID: string;
    toDID: string;
    messageType: string;
    messageContent: string;
    signature: string;
    sigType: string;
    link: string;
    timestamp: number;
    encType: string;
    encryptedSecret: string;
};

export type ChatEventRawType = {
    fromCAIP10: string;
    toCAIP10: string;
    fromDID: string;
    toDID: string;
    encType: string;
    encryptedSecret: string | null;
    signature: string;
    sigType: string;
    verificationProof: string | null;
    previousReference: string | null;
};

export type ChatEventTypes =
    | "chat.message"
    | "chat.request"
    | "chat.accept"
    | "chat.reject"
    | "chat.group.participant.remove"
    | "chat.group.participant.join"
    | "chat.group.participant.leave";

export type ChatEvent<T extends ChatEventTypes = ChatEventTypes> = {
    event: T;
    origin: "self" | "other";
    timestamp: string;
    chatId: string;
    from: string;
} & (T extends "chat.message"
    ? {
          to: string[];
          message: Message;
          meta: { group: boolean };
          reference: string | null;
          raw: ChatEventRawType;
      }
    : T extends "chat.request"
      ? {
            to: string[];
            message?: Message;
            meta: { group: boolean };
            reference?: string | null;
            raw: Partial<ChatEventRawType> & Pick<ChatEventRawType, "verificationProof">;
        }
      : T extends "chat.accept"
        ? {
              to: string[];
              message: { type: string; content: string };
              meta: { group: boolean };
              reference: string | null;
              raw: ChatEventRawType;
          }
        : T extends "chat.reject"
          ? {
                to: string[];
                message: { type: null; content: null };
                meta: { group: boolean };
                reference: string | null;
                raw: ChatEventRawType;
            }
          : T extends "chat.group.participant.remove"
            ? {
                  to: string[];
                  raw: Pick<ChatEventRawType, "verificationProof">;
              }
            : T extends "chat.group.participant.join"
              ? {
                    to: null;
                    raw: Pick<ChatEventRawType, "verificationProof">;
                }
              : T extends "chat.group.participant.leave"
                ? {
                      to: null;
                      raw: Pick<ChatEventRawType, "verificationProof">;
                  }
                : never);

export type ChatMessage = ChatEvent<"chat.message">;
export type ChatRequest = ChatEvent<"chat.request">;
export type ChatAccept = ChatEvent<"chat.accept">;
export type ChatReject = ChatEvent<"chat.reject">;
export type ChatGroupParticipantRemove = ChatEvent<"chat.group.participant.remove">;
export type ChatGroupParticipantJoin = ChatEvent<"chat.group.participant.join">;

export type ScopeData = {
    // the chat id
    chatId: string;

    // from user
    from: string;

    // the event that triggered the command
    event: ChatEvent<any>;

    // the event history related to the scope
    events: ChatEvent<any>[];

    // the data related to the scope (optional if needed)
    data?: any;
};

export type Scope = ScopeData & {
    // send a message to the chat
    send: (message: Message) => Promise<MessageWithCID>;

    // end the command by setting isDone to true
    isDone: boolean;
};

export type CommandHandler = (scope: Scope) => void;
