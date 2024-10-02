import { Message, MessageWithCID } from "@pushprotocol/restapi";

export type ChatEventRawType = {
    fromCAIP10: string;
    toCAIP10: string;
    fromDID: string;
    toDID: string;
    encType: string;
    encryptedSecret: string | null;
    signature: string;
    sigType: string;
    verificationProof: string;
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

export type ChatEvent<T extends ChatEventTypes> = {
    event: T;
    origin: "self" | "other";
    timestamp: number;
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

export type Scope = {
    // the chat id
    chatId: string;

    // from user
    from: string;

    // the event that triggered the command
    event: ChatEvent<any>;

    // the event history related to the scope
    events: ChatEvent<any>[];

    // send a message to the chat
    send: (message: Message) => Promise<MessageWithCID>;

    // continue the command processing
    // call this function to continue the command processing, next message will be processed with the same command handler and scope
    end: () => void;
};

export type CommandHandler = (scope: Scope) => void;
