# Topical

*Topical* is a framework for modeling conversations in [Microsoft BotBuilder 4.x](https://github.com/microsoft/botbuilder-js) using the *Topics* pattern.

***Topical* is an experimental framework, not a supported Microsoft product. Use at your own risk.**

**Like BotBuilder 4.x, *Topical* is in rapid development, and every aspect is subject to change in upcoming versions.**

## How do I install *Topical*?

`npm install -S botbuilder-topical`

## The *Topics* pattern

The Topics pattern models conversations as a dynamic heirarchy of independent conversational topics. Messages pass down through the heirarchy, each topic handling the message and/or passing it on to a child topic as it sees fit. A child topic notifies its parent when it's done.

![Topics](/Topics.gif)

**Note**: the method names on this graphic need to be updated: `init` -> `onBegin` and `onReceive` -> `onTurn`

The *Topical* library provides low-level support for this pattern. 

## What does *Topical* code look like?

Here's a snippet that shows a common pattern: a "root" topic creating a child, dispatching messages to it, and, when the child completes, handling its return.
```ts
class Root extends Topic {

    async onBegin() {
        await this.context.sendActivity("How can I help you today?");
    }

    async onTurn() {
        if (await this.dispatchToChild())
            return;

        if (this.context.activity.text === "book travel") {
            await this.beginChild(TravelTopic);
        }
    }

    async onChildReturn() {
        await this.context.sendActivity(`Welcome back to the Root!`);
        this.clearChildren();
    }
}
Root.subtopics = [TravelTopic];
```

## Tell me about Topics and children

A given topic can have:

* no children
* a single child
* multiple children

## What goes into a Topic?

It's up to you, but the idea is that each Topic maps to a specific topic of conversation (thus the name).

For instance, the *Travel* topic could handle general questions about travel, but when the user is ready to book a flight it would spin up a child *Flight* topic, and start dispatching incoming messages to that child. Furthermore, when no airport has been defined, *Flight* spins up the *Airport Picker* topic and dispatches messages to it.

Topics can be written independently of one another and composed together.

An important detail is that delegation doesn't have to be all or nothing -- *Travel* could continue answering specific questions it recognizes, e.g. "Is it safe to travel to Ohio?", and pass the rest on to *Flight*. This is why each message travels down from the top of the topic heirarchy.

Midway through booking a flight, as illustrated above, a user might want to look into hotels. *Travel* could recognize that question and spin up a *Hotel* topic. It could end the *Flight* topic, or keep them both active. How does *Travel* know where to send subsequent messages? That is the hard part. *Topical* provides the structure, you provide the logic.

## Do you have samples?

Yes. To run them, you'll need to clone this repo.

[simple sample](/samples/simple.js) is a JavaScript bot demonstrates a conversation with parent-child topics. Run `node samples/simple.js`

The rest of the samples are written in TypeScript. To run them you'll need to:

* `npm install`
* `npm run build`

Note: all these are console bots, and use the helper `consoleOnTurn` which wraps `listen()` and injects in a `conversationUpdate` activity at the beginning of the conversation. As such, you can easily reuse the logic in a Bot Framework bot.

[alarm bot](/samples/alarmBot.ts) has a little more depth. Run `node lib/samples/alarmBot.js`

[custom context](/samples/customContext.ts) demonstrates the use of a custom `TurnContext`. Run `node lib/samples/customContext.js`

[culture](/samples/culture.ts) demonstrates the use of a custom prompt validator and `NumberPrompt`, which requires providing a constructor argument. Run `node lib/samples/culture.js`

[triggers](/samples/triggers.ts) demonstrates the use of triggers. Run `node lib/samples/triggers.js`

[knock knock](/samples/knockKnock.ts) demonstrates the use of a simple waterfall. Run `node lib/samples/knockKnock.js`

[waterfall](/samples/knockKnock.ts) demonstrates the use of Prompts in a waterfall. Run `node lib/samples/waterfall.js`

## Can I publish my own Topics?

Please do! [SimpleForm](/src/SimpleForm.ts) is a (simple) example of a "form fill" `Topic` that could be of general use (as in the alarm bot sample). It also demonstrates how to express a dependency on another `Topic` (`TextPrompt`).

## Creating a Topical application

First, initialize *Topical* by calling `Topic.init` with a state storage provider. This is where *Topical* will persist each topic's state.
```ts
Topic.init(new MemoryStorage());
```
Then, create a subclass of `Topic` which will be your "root". Every activity for every user in every conversation will flow through this topic. A typical root topic will create one or more children and dispatch messages to them.
```ts
class YourRootTopic extends Topic {
    // your topic here
}
```
Finally it's time to hook your root topic up to your message loop:
```ts
yourMessageLoop(async context => {
     if (context.activity.type === 'conversationUpdate') {
        for (const member of context.activity.membersAdded) {
            if (member.id != context.activity.recipient.id) {
                await YourRootTopic.begin(context, beginArgs, constructorArgs);
            }
        }
    } else {
        await YourRootTopic.onTurn(context);
    }
});
```
This is such a common pattern that there's a helper:
```ts
yourMessageLoop(context => doTopic(YourRootTopic, beginArgs?, constructorArgs?));
```

## Next steps

Read about different [patterns](/docs/patterns.md) that can be implemented with *Topical*.

Learn about [prompts](/docs/prompts.md) and [waterfalls](/docs/waterfalls.md).

Learn how *Topical* [works](/docs/understanding.md).

## Docs to be written

Learn the *Topical* API in the [reference](/docs/reference.md).

