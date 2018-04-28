# Topical

*Topical* is a framework for modeling conversations in [Microsoft BotBuilder 4.x](https://github.com/microsoft/botbuilder-js) using the *Topics* pattern.

***Topical* is an experimental framework, not a supported Microsoft product. Use at your own risk.**

**Like BotBuilder 4.x, *Topical* is in rapid development, and every aspect is subject to change in upcoming versions.**

## How do I install *Topical*?

`npm install -S botbuilder-topical`

## The *Topics* pattern

The Topics pattern models conversations as a dynamic tree of independent conversational topics, each with its own state. Activities pass down through the tree, each topic handling the activity and/or passing it on to a child topic as it sees fit. A child topic notifies its parent when it's done.

![Topics](/Topics.gif)

**Note**: the method names on this graphic need to be updated: `init` -> `onStart` and `onReceive` -> `onDispatch`

The *Topical* library provides low-level support for this pattern. 

## Why should I use *Topical* instead of `botbuilder-dialogs`?

The built-in `botbuilder-dialogs` library takes the v3.x Node "Dialogs" pattern and improves upon it in two ways:
* you can choose to write Dialog logic as either a waterfall or a standard message loop
* you invoke the dialog stack from your main message loop, which means the confusing triggers/scorables concepts from v3 have been eliminated

However the pattern is the same as v3.x: the current activity is routed directly to the current dialog (the one at the top of the stack). This means that each dialog doesn't have a chance to make decisions about how to an activity, including whether to dispatch it to a child. That, and the fact that you are limited to a stack of dialogs (instead of a tree), means that you are very limited in the types of conversational flow that you can implement.

The *Topics* pattern was designed to solve these problems.

Also, many find *Topical*'s API simpler and easier to use.

## What does *Topical* code look like?

Here's a snippet that shows a common pattern: a "root" topic creating a child, dispatching messages to it, and, when the child completes, handling its return.
```ts
class Root extends Topic {

    async onStart() {
        await this.context.sendActivity("How can I help you today?");
    }

    async onDispatch() {
        if (await this.dispatchToChild())
            return;

        if (this.context.activity.text === "book travel") {
            await this.startChild(TravelTopic);
        }
    }

    async onChildReturn() {
        await this.context.sendActivity(`Welcome back to the Root!`);
        this.clearChildren();
    }
}
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

An important detail is that delegation doesn't have to be all or nothing -- *Travel* could continue answering specific questions it recognizes, e.g. "Is it safe to travel to Ohio?", and pass the rest on to *Flight*. This is why each message travels down from the top of the topic tree.

Midway through booking a flight, as illustrated above, a user might want to look into hotels. *Travel* could recognize that question and spin up a *Hotel* topic. It could end the *Flight* topic, or keep them both active. How does *Travel* know where to send subsequent messages? That is the hard part. *Topical* provides the structure, you provide the logic.

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
                await YourRootTopic.start(context, startArgs, constructorArgs);
            }
        }
    } else {
        await YourRootTopic.dispatch(context);
    }
});
```

## Helpers

This is such a common pattern that there's a helper:
```ts
yourMessageLoop(context => doTopic(YourRootTopic, context, startArgs, constructorArgs));
```

In addition to helping your application implement the *Topics* abstraction, *Topical* has a few helpers which make life easier for you bot builders:

* `consoleOnturn` wraps `ConsoleAdapter`'s `listen` method, injecting in a `conversationUpdate` activity at the start of the conversation. This helps you share the same bot logic between Console bots and Bot Framework bots.

In every topic:
* `this.text` is a shorthand for `this.context.activity.text.trim()` -- it is `undefined` if the activity type is not `message`
* `this.send` is a shorthand for `this.context.sendActivity`

Topic shouldn't reimplement every part of `this.context` -- but let's all look for places where it can make life easier. 

These helpers are used throughout the [samples](#samples).

## Samples

To these samples, you'll need to clone this repo.

[simple sample](/samples/simple.js) is a JavaScript bot demonstrates a conversation with parent-child topics. Run `node samples/simple.js`

The rest of the samples are written in TypeScript. To run them you'll need to:

* `npm install`
* `npm run build`

Note: all these are console bots, and use the helper `consoleOnTurn` described [below](#helpers).

[alarm bot](/samples/alarmBot.ts) has a little more depth. Run `node lib/samples/alarmBot.js`

[custom context](/samples/customContext.ts) demonstrates the use of a custom `TurnContext`. Run `node lib/samples/customContext.js`

[culture](/samples/culture.ts) demonstrates the use of a custom prompt validator and `NumberPrompt`, which requires providing a constructor argument. Run `node lib/samples/culture.js`

[triggers](/samples/triggers.ts) demonstrates the use of triggers. Run `node lib/samples/triggers.js`

[knock knock](/samples/knockKnock.ts) demonstrates the use of a simple waterfall. Run `node lib/samples/knockKnock.js`

[waterfall](/samples/knockKnock.ts) demonstrates the use of Prompts in a waterfall. Run `node lib/samples/waterfall.js`

## Next steps

Read about different [patterns](/docs/patterns.md) that can be implemented with *Topical*.

Learn about [prompts](/docs/prompts.md) and [waterfalls](/docs/waterfalls.md).

Learn how *Topical* [works](/docs/understanding.md).

## Docs to be written

Learn the *Topical* API in the [reference](/docs/reference.md).

