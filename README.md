# Topical

*Topical* is a framework for modeling conversations in [Microsoft BotBuilder 4.x](https://github.com/microsoft/botbuilder-js) using the *Topics* pattern.

***Topical* is an experimental framework, not a supported Microsoft product. Use at your own risk.**

**Like BotBuilder 4.x, *Topical* is in rapid development, and every aspect is subject to change in upcoming versions.**

## How do I install *Topical*?

`npm install -S botbuilder-topical`

## The *Topics* pattern

The Topics pattern models conversations as a dynamic heirarchy of independent conversational topics. Messages pass down through the heirarchy, each topic handling the message and/or passing it on to a child topic as it sees fit. A child topic notifies its parent when it's done.

![Topics](/Topics.gif)

The Topical library is simply meant to provide low-level support for this pattern. Classes are provided for two kinds of applications: standard applications and scalable web services.

## Standard applications

For single-user in-process applications, the Topics pattern is easily implemented with traditional object-oriented programming.

Topical supplies a [`Topic`](/src/Topic.ts) class. Here's a simple version of the Root topic illustrated above: 

```ts
class RootTopic extends Topic {
    async init(context, args) {
        context.reply("How can I help you today?");
    }
    async onReceive(context) {
        if (await this.dispatch(context, this.state.child))
            return;

        if (context.request.text === "book travel") {
            this.state.child = await new TravelTopic().createInstance(
                context, async (context) => {
                    context.reply(`Welcome back to the Root!`);
                    this.state.child = undefined;
                });
        }
    }
}
```

## Scalable web services

Traditional object-oriented programming won't work for many-users-to-many-instances web apps. The heirarchy of topics for each conversation must be maintained in a centralized store. Moreover, child topics may complete in entirely different instances (and in extended timeframes), making it impossible to utilize traditional completion handlers.

Topical supplies a [`TopicClass`](/src/TopicClass.ts) class, which models traditional object-oriented programming in a distributed system:

* `FooClass` is created by extending `TopicClass`.
* An instance of this (which we call the "topic class") is created by calling `const fooClass = new FooClass(`fooClass`). This happens justonce per application instance at startup, using the provided unique id to correlate the same topic class across application instances.
* Each "instance" of `fooClass` is created in the centralized store, each referencing the id of its class, by calling `topicClass.createInstance()`.
* Almost every method in `topicClass` takes an `instance` parameter. This is where state is stored.
* Completion handlers are implemented as a listener method.

In this way, each turn can be very efficiently executed on a given instance of your application.

Here's the scalable web service version of the above code:

```ts
class RootTopicClass extends TopicClass {
    async init(context, instance, args) {
        context.reply("How can I help you today?");
    }
    async onReceive(context, instance) {
        if (await this.dispatch(context, instance.state.child))
            return;

        if (context.request.text === "book travel")
            instance.state.child = await travelTopicClass.createInstance(context, instance);
    }
    async onChildReturn(context, instance, childInstance) => {
        context.reply(`Welcome back to the Root!`);
        instance.state.child = undefined;
    }
}
```

As you can see, you can continue to code largely the way you're used to, with just a few simple transformations.

## What if I want a Topic to have many children?

Each topic defines and maintains its own state, including any notion of heirarchy. A given topic could have:

* no children
* a single child
* a map of children (allowing fast access to the right one)
* an array of children (for instance an array of open questions ordered by recency)
* ... or anything else

## What goes into a Topic?

It's up to you, but the idea is that each Topic maps to a specific topic of conversation (thus the name).

For instance, the *Travel* topic could handle general questions about travel, but when the user is ready to book a flight it would spin up a child *Flight* topic, and start dispatching incoming messages to that child. Furthermore, when no airport has been defined, *Flight* spins up the *Airport Picker* topic and dispatches messages to it.

Topics can be written independently of one another and composed together.

An important detail is that delegation doesn't have to be all or nothing -- *Travel* could continue answering specific questions it recognizes, e.g. "Is it safe to travel to Ohio?", and pass the rest on to *Flight*. This is why each message travels down from the top of the topic heirarchy.

Midway through booking a flight, as illustrated above, a user might want to look into hotels. *Travel* could recognize that question and spin up a *Hotel* topic. It could end the *Flight* topic, or keep them both active. How does *Travel* know where to send subsequent messages? That is the hard part. *Topical* provides the structure, you provide the logic.

## Do you have samples?

The [simple sample](/samples/simple.js) is a JavaScript bot demonstrates a simple conversation with parent-child topics. To run it:

* clone this repo
* `node samples/simple.js`

The [alarm bot](/samples/alarmBot.ts) is a TypeScript bot with a little more depth. To run it:

* clone this repo
* `npm install`
* `npm run build`
* `node lib/samples/alarmBot.js`

The [simple alarm bot](/samples/simpleAlarmBot.ts) is the identical bot implemented as a simple application. To run it:

* clone this repo
* `npm install`
* `npm run build`
* `node lib/samples/alarmBot.js`

## Can I publish my own Topics?

Please do! [SimpleForm](/src/forms.ts) is a (simple) example of a Topic that is of general use (it's used by the alarm bot). It demonstrates how to use another Topic (StringPrompt) without topic id namespace collisions.

## Overly Quick Reference for `Topic`

### `Topic.do(context: BotContext, getRootTopic: () => Promise<Topic>): Promise<void>`

This bootstraps your topic heirarchy with a designated root topic:

```ts
bot.onReceive(async context => {
    await Topic.do(context, () => new RootTopic().createInstance(context));
})
```

`getRootTopic()` will be only called once, on the first request.

### `Topic.rootTopic`

This is the root topic generated by `getRootTopic` above.

### `Topic.createInstance(context: BotContext, args?, returnToParent: (context: BotContext, args?) => Promise<void>): Promise<void>`

When creating an instance of a topic we want to allow asynchronous operations, e.g. look you up in the company database to greet you by name. Since JavaScript does not support asynchronous constructors, we get a little tricky. In a Topic's constructor we create an asynchronous private `init()` function.

Then when we create a topic instance we 
1. call the Topic's constructor
2. call that instance's asynchronous `createInstance()` method (which itself calls the private `init()` method)

This is typically done in a single line:

```ts
const instance = new MyTopic().createInstance(context);
```

If the `init()` method calls `returnToParent()`, `createInstance()` will return `undefined`.

### `Topic.dispatch(context: BotContext, topic: Topic): Promise<boolean>`

This is how you pass a message to a topic's `onReceive()` method. Do not call `onReceive` directly.

A common piece of code is 

```ts
if (this.state.child)
    return this.dispatch(context, this.state.child);
```

`dispatch()` checks to see if the supplied topic is `undefined` before continuing. `dispatch()` returns a boolean which says whether the dispatch happened, so you simplify this a little to:

```ts
if (await this.dispatch(context, this.state.child))
    return;
```

By not duplicating the reference to the target instance there's one less bug that can be introduced.

### `Topic.doNext(context: BotContext, topic: Topic): Promise<boolean>`

`doNext()` is to `next()` what `dispatch()` is to `onReceive()` 

### *More Topic reference to come*

## Overly Quick Reference for `TopicClass`

### `Topic.do(context: BotContext, getRootInstanceName: () => Promise<Topic>): Promise<void>`

This bootstraps your topic heirarchy with a designated root topic:

```ts
bot.onReceive(async context => {
    await Topic.do(context, () => new rootTopicClass.createInstance(context));
})
```

`getRootInstanceName()` will be called just once for each conversation.

### `instance`

This object is retrieved from a store and cached in memory via the `BotStateManager` ORM. At the end of the turn the new contents are persisted back out to the store. It contains:

#### `instance.state`

Each instance of a topic has its own state. This will ultimately be persisted as JSON, so you should restrict yourself to JSON-compatible types (e.g. no functions or `Date`s).

#### `instance.name`

The id of the instance. This is the key used to retrieve and save the instance in the store.

#### `instance.topicName`

The name of the Topic of which this is an instance. This is the key used to corrolate Topic classes across all app instances.

#### `instance.parentInstanceName`

The id of the parent's instance. Only the root topic has no `parentInstanceName`.

#### `topicClass.createInstance(context: BotContext, instance: TopicInstance, args?): Promise<string>`

Creates an instance of `topicClass` and returns its instance id. Typically you would store this somewhere in the topic state for later use in dispatching messages. You may optionally pass an `args` object which will be provided to the topic's `.init()` method. 

### `topicClass.dispatch(context: BotContext, instanceName: string): Promise<boolean>`

Calls the `.onReceive()` method of the instance named. Do not call `onReceive()` directly.

This is a common piece of code:

```ts
if (instance.state.child)
    return this.dispatch(instance.state.child);
```

`dispatch()` checks to see if the supplied topic is `undefined` before calling its `onReceive()` method. `dispatch()` returns a boolean which says whether the dispatch happened,so you simplify this a little to:

```ts
if (await this.dispatch(context, instance.state.child))
    return;
```

By not duplicating the instance there's one less bug that can be introduced.

### `topicClass.doNext(context: BotContext, instanceName: string): Promise<boolean>`

`doNext()` is to `next()` what `dispatch()` is to `onReceive()`

#### `topicClass.rootInstanceName`

The id of the instance for the root topic. Useful for calling the `.next()` method of the root topic.

### TopicClass Methods

When creating a Topic Class you may override any or all of the following methods:

#### `TopicClass.init(context: BotContext, instance: TopicInstance, args?)`

Run after the Topic instance is created. This is where you can set up your initial state, perhaps using the (optional) `args` provided when the instance was created. This is also a good place to send a welcome message.

If you call `this.returnToParent(returnArgs)` from `init()`, `createInstance` will delete the instance and send `response` to the parent topic's `onChildReturn()` handler.

#### `TopicClass.next(context: BotContext, instance: TopicInstance)`

This is useful when you want to share "next action" logic between your `.init()` and `.onReceive()` methods. See it in use in [SimpleForm](/src/forms.ts).

If you call `this.returnToParent(returnArgs)`, after `next()` ends, the reference to this instance will be deleted and the `returnArgs` will be sent to the parent topic's `onChildReturn()` handler.

#### `TopicClass.onReceive(context: BotContext, instance: TopicInstance)`

Run for each activity dispatched via `topicClass.dispatch()` to the topic instance.

If you call `this.returnToParent(returnArgs)`, after `onReceive()` ends, the reference to this instance will be deleted and the `returnArgs` will be sent to the parent topic's `onChildReturn()` handler.


#### `TopicClass.onChildReturn(context: BotContext, instance: TopicInstance, childInstance; TopicInstance)`

This is the other side of a call to `this.returnToParent(returnArgs)`. The reference to the instance deleted, and the instance (with the returnArgs set in `.returnArgs`), is sent via `childInstance`.

You will need to examine `childInstance.topicName` to determine which child topic is returning. If you have multiple children that are instances of the same topic (common for prompts) then you will have to disambiguate the responses. `TextPromptTopicClass`, for example, carries a `name` property for this purpose.

If you call `this.returnToParent(returnArgs)`, after `onChildReturn()` ends, the reference to this instance will be deleted and the `returnArgs` will be sent to the parent topic's `onChildReturn()` handler.

### TopicClass typing

TypeScript users may specify types for the arguments to, state of, and response from, Topic and TopicClass.


```ts
interface InitArgs {
    foo: number;
}
interface State {
    foo: number;
    bar: string;
}
interface ReturnArgs {
    foobar: string;
}

interface YourState {
    child: string;
}

// Standard applications

class MyTopic extends Topic<InitArgs, State, ReturnArgs> {
    async init(context: BotContext, args?: InitArgs) {
        this.state = {
            foo: args.foo,
            bar: 15                                 // error
        }
        this.returnToParent({
            foo: this.state.bar                     // error
        })
    })

class YourTopic extends Topic<YourState>('yourTopic')
    async init(context: BotContext) {
        this.state.child = await new MyTopic().createInstance(
            context, {
                bar: "hey"                           // error
            }, (context, args) => {
                context.reply(args.bar);            // error
            });
    })
    async onReceive(context: BotContext) {
        if (this.state.child)
            return this.state.child.onReceive(context);
    });

// Scalable web services

class MyTopic extends TopicClass<InitArgs, State, ReturnArgs> {
    async init(context: BotContext, instance: TopicInstance<State, ReturnArgs>, args?: InitArgs) {
        instance.state = {
            foo: args.foo,
            bar: 15                                 // error
        }
        this.returnToParent({
            foo: this.state.bar                     // error
        })
    });

class myTopic = new MyTopic('myTopic');

class YourTopic extends Topic {
    async init(context: BotContext, instance: TopicInstance) {
        instance.state.child = await myTopic.createInstance(context, instance, {
            bar: "hey"                              // error
        });
    })
    async onReceive(context: BotContext) {
        await this.dispatch(context, instance.state.child);
    });
    async onChildReturn(context: BotContext, instance: TopicInstance, childInstance: TopicInstance) {
        context.reply(args.bar);                    // should be an error, but currently is not
    }

``
