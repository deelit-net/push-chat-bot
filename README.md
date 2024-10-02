# Push Protocol Chat Bot (Work In Progress)

This library provides a chat bot implementation for the Push Chat API.

see: [Push Protocol](https://push.org/)

## Usage

```typescript
import { PushBot } from "@deelit/push-chat-bot";
import { ethers } from "ethers";

async function main() {
    // Initialize the bot wallet
    const wallet = new ethers.Wallet("bot-private-key");

    // Initialize the bot
    const bot = await PushBot.initialize(wallet);

    // Register the bot commands
    bot.command(/\/ping/, ($: Scope) => {
        // send a message on the chat
        $.send({ type: "Text", content: "Pong!" });

        // declare that the command is finished (no more event awaited)
        $.end();
    });

    // Start the bot
    await bot.start();
}
```
