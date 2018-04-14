# Topical

*Topical* is a framework for modeling conversations in [Microsoft BotBuilder 4.x](https://github.com/microsoft/botbuilder-js) using the *Topics* pattern.

***Topical* is an experimental framework, not a supported Microsoft product. Use at your own risk.**

**Like BotBuilder 4.x, *Topical* is in rapid development, and every aspect is subject to change in upcoming versions.**

## How do I install *Topical*?

Standard applications: `npm install -S botbuilder-topical-lite`

Scalable web services: `npm install -S botbuilder-topical`

## The *Topics* pattern

The Topics pattern models conversations as a dynamic heirarchy of independent conversational topics. Messages pass down through the heirarchy, each topic handling the message and/or passing it on to a child topic as it sees fit. A child topic notifies its parent when it's done.

![Topics](/Topics.gif)

**Note**: this graphic is now a little out of date, but the basic idea is correct

The Topical library is simply meant to provide low-level support for this pattern. Classes are provided for two kinds of applications: standard applications and scalable web services.

## Standard applications

** Note: `topical-lite` is currently lagging behind `topical` **

For single-user in-process applications, the Topics pattern is easily implemented with traditional object-oriented programming.

`topical-lite` supplies a [`Topic`](/packages/topical-lite/src/Topic.ts) class. Here's a simple version of the Root topic illustrated above:

```ts
class Root extends TopicWithChild {
    async onBegin(args) {
        await this.context.sendActivity("How can I help you today?");
    }

    async onTurn() {
        if (await this.dispatchToChild())
            return;

        if (this.context.request.text === "book travel") {
            await this.beginChild(TravelTopic,
                async (context, return) => {
                    await context.sendActivity(`Welcome back to the Root!`);
                    this.clearChild();
                }
            );
        }
    }
}
```

## Scalable web services

Traditional object-oriented programming won't work for many-users-to-many-instances web apps. The heirarchy of topics for each conversation must be maintained in a centralized store. Moreover, child topics may complete in entirely different instances (and in extended timeframes), making it impossible to utilize traditional completion handlers.

`topical` hides most of these differences: 

```ts
class Root extends TopicWithChild {

    async onBegin(args) {
        await this.context.sendActivity("How can I help you today?");
    }

    async onTurn() {
        if (await this.dispatchToChild())
            return;

        if (this.context.request.text === "book travel") {
            await this.beginChild(TravelTopic);
        }
    }

    async onChildReturn(child) {
        await this.context.sendActivity(`Welcome back to the Root!`);
        this.clearChild();
    }
}

Root.subtopics = [TravelTopic];
```
The main visible differences are:
* something called "subtopics" (explained shortly)
* the way child topics return values
* (not illustrated) a restriction for constructing `Topic`s.

As you can see, you can code topics in distributed web services largely the same way as standard applications. This is the magic of *Topical*.

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

The [simple sample](/packages/topical-lite/samples/simple.js) is a JavaScript bot demonstrates a simple conversation with parent-child topics. To run it:

* clone this repo
* `node samples/simple.js`

The [alarm bot](/packages/topical-lite/samples/alarmBot.ts) is a TypeScript bot with a little more depth. To run it:

* clone this repo
* `npm install`
* `npm run build`
* `node lib/samples/alarmBot.js`

The [custom context](/packages/topical-lite/samples/customContext.ts) sample demonstrates the use of a custom `TurnContext`.

* clone this repo
* `npm install`
* `npm run build`
* `node lib/samples/customContext.js`

The [culture](/packages/topical-lite/samples/culture.ts) sample demonstrates the use of a custom promp validator and `NumberPrompt`, which requires providing a constructor argument.

* clone this repo
* `npm install`
* `npm run build`
* `node lib/samples/culture.js`

## Can I publish my own Topics?

Please do! [SimpleForm](/packages/topical-lite/src/SimpleForm.ts) is a (simple) example of a "form fill" `Topic` that could be of general use (as in the alarm bot sample). It also demonstrates how to express a dependency on another `Topic` (`TextPrompt`).

## Using Topical

Sorry, for now please look at the samples to see *Topical* in action.

## Understanding Topical

### "Conceptual" and "Turn" Instances

In a *Topical* application, the conversational state for a given user in a conversation is represented as a dynamic heirarchy of instances of subclasses of `Topic`.

We call these *conceptual instances*, because in a distributed system this heirarchy of instances is stored in a centralized state store. On each turn, instance data is loaded in from the state store, instances of `Topic` subclasses (*turn instances*) are constructed as needed, and the updated instance data is saved back to the state store at the end of the turn.

### Subtopics, and Registration

When its time to construct a turn instance of a `Topic` subclass, *Topical* needs to know which subclass to construct. This information is gathered when the application starts up through a process called *registration*, wherein each subclass is associated with a string (its name). The persisted instance data contains the name of its subclass.

The way registration works is that each subclass of `Topic` declares all the *other* subclasses of `Topic` that it might have to create or load. We call these *subtopics* and they are declared as follows:

```ts
ThisTopic.subtopics = [ChildTopic, AnotherChildTopic];
```

In TypeScript, from within your class, you can do:

```ts
static subtopics = [ChildTopic, AnotherChildTopic];
```

When your application starts up, your root topic and its subtopics are automatically registered. This process is recursive. In other words if `ChildTopic` declares subtopic `GrandchildTopic`, that will be registered too, and so on.

### Subtopic construction & lifecycle

*Topical* constructs turn instances of `Topic` subclasses for you, as follows:

In any method of a given topic, you *begin* a subclass of `Topic` of by calling `this.beginChild(SubclassOfTopic, beginArgs?, constructorArgs?)`. This:

* creates a conceptual instance of `SubclassOfTopic`, including a unique name. This will be persisted to the state store at the end of the turn
* calls `new SubclassOfTopic(constructorArgs)`, sets its `.instanceName` and `.state`, and calls its `.onBegin(beginArgs)`
* sets `this.state.child` of the calling turn instance to the `.instanceName` of the just-created turn instance of `SubclassOfTopic`

Subsequently (either in the same turn or on a later turn) you can call `this.dispatchToChild()`, usually (but not always) from within the `onTurn` method of a given topic. This:

* gets the conceptual instance name from the turn intance of the method's topic's `this.state.child`
* loads the conceptual instance from the state store
* looks up `SubclassOfTopic` in *Topical*'s Registration map
* calls `new SubclassOfTopic(constructorArgs)`, sets its `.instanceName` and `.state`, and calls its `.onTurn()`

As you can see, `new SubclassOfTopic(constructorArgs)` may happen multiple times over the lifetime of the conceptual instance. As a result, `SubclassOfTopic`'s constructor should only do things that make sense both for beginning and dispatching `SubclassOfTopic`, and `constructorArgs` should only contain arguments necessary to *construct* a turn instance of `SubclassOfTopic`.

Many subclasses of `Topic` don't need a constructor at all.

### Creating a Topical application

First, create a subclass of `Topic` which will be your "root topic". Every activity for every user in every conversation will flow through this topic. If it has subtopics (potential child topics), declare them.

```ts
class YourRootTopic extends Topic {
}
```

Then initialize *Topical* by calling `Topic.init` with a state storage provider. This is where *Topical* will persist each topic's state.

```ts
Topic.init(new MemoryStorage());
```

Your *Topical* application is bootstrapped as follows:

```ts
adapter.listen(async context => {
    await YourRootTopic.do(context, beginArgs?, constructorArgs?);
})
```

When it's called the first time, `YourRootTopic.do`:
* throws if `Topic.init` hasn't already been called
* calls `YourRootTopic.register()`, recursively registering `YourRootTopic`, its subtopics, all *their* subtopics, and so on.

The first time an activity is received for a given user in a conversation, `YourRootTopic.do`:
* begins a conceptual instance of `YourRootTopic` (as noted above, this calls `.onBegin(beginArgs)`)
* sets it as your root topic instance

On subsequent turns for a given user in a conversation, `YourRootTopic.do`:
* dispatches to the root topic instance (as noted above, this calls `.onTurn()`)

## Overly Quick Reference for *Topical*

Need updating.

<s>
#### `Topic.init(storage: Storage)`


### `Topic.do(context: BotContext, RootTopic: typeof Topic, args): Promise<void>`

This bootstraps your topic heirarchy with a designated root topic:

```ts
adapter.listen(async context => {
    await Topic.do(context, Root);
})
```

`getRootTopic()` will be only called once, on the first request.

### `Topic.rootTopic`

This is the root topic generated by `getRootTopic` above.

### `new Topic().createInstance(context: BotContext, args?, returnToParent: (context: BotContext, args?) => Promise<void>): Promise<void>`

When creating an instance of a topic we want to allow asynchronous operations, e.g. look you up in the company database to greet you by name. Since JavaScript does not support asynchronous constructors, we get a little tricky. In a Topic's constructor we create an asynchronous private `init()` function.

Then when we create a topic instance we 
1. call the Topic's constructor
2. call that instance's asynchronous `createInstance()` method (which itself calls the `init()` method)

This is typically done in a single line:

```ts
const instance = await new MyTopic().createInstance(context);
```

If the `init()` method calls `returnToParent()`, `createInstance()` will return `undefined`.

### `this.dispatch(context: BotContext, topic: Topic): Promise<boolean>`

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

### `this.doNext(context: BotContext, topic: Topic): Promise<boolean>`

`doNext()` is to `next()` what `dispatch()` is to `onReceive()` 

### *More Topic reference to come*

## Overly Quick Reference for `TopicClass`

### `constructor(name?: string)`

Every Topic class needs a unique ID. By default this is the class name, but you can provide more disambugation by passing your own name, which will be appended to the class name.

You don't need to have a constructor. It's there for any operations you want to do once, when the topic class is created, as opposed to `init()` which is called on each instance.

If you dispatch to any child topics, this is where you set up handlers for them to return their arguments.

```ts
constructor(name) {
    super(name);

    this
        .onChildReturn(childTopic1, async (context, instance, childInstance) => {...})
        .onChildReturn(childTopic2, async (context, instance, childInstance) => {...})
        .onChildReturn(childTopic3, async (context, instance, childInstance) => {...})
        .afterChildReturn(async (context, instance, childInstance) => {...});
}
```

Each `onChildReturn()` handler is the other side of a call to `this.returnToParent(returnArgs)`. The reference to the instance has been deleted, and the instance (with the state cleared and the returnArgs set in `.returnArgs`), is sent via `childInstance`.

If you have multiple children that are instances of the same topic (common for prompts) then you will have to disambiguate the responses. `TextPromptTopicClass`, for example, carries a `name` property for this purpose.

If you call `this.returnToParent(returnArgs)`, after `onChildReturn()` ends, the reference to this instance will be deleted and the `returnArgs` will be sent to the *parent* topic's `onChildReturn()` handler.

The use of `afterChildReturn()` is purely optional - a convenient place to do unified cleanup, typically this is where the reference to a `childInstance.name` is removed.

### `TopicClass.do(context: BotContext, getRootInstanceName: () => Promise<Topic>): Promise<void>`

This bootstraps your topic heirarchy with a designated root topic:

```ts
bot.onReceive(async context => {
    await Topic.do(context, () => new rootTopicClass.createInstance(context));
})
```

`getRootInstanceName()` will be called just once for each conversation.

### `instance: TopicInstance`

Most methods off of a topic class get an `instance` argument. This object is retrieved from a store and cached in memory via the `BotStateManager` ORM. At the end of the turn the new contents are persisted back out to the store. It contains:

#### `instance.state`

Each instance of a topic has its own state. This will ultimately be persisted as JSON, so you should restrict yourself to JSON-compatible types (e.g. no functions or `Date`s).

#### `instance.name`

The id of the instance. This is the key used to retrieve and save the instance in the store.

#### `instance.topicName`

The name of the Topic of which this is an instance. This is the key used to corrolate Topic classes across all app instances.

#### `instance.parentInstanceName`

The id of the parent's instance. Only the root topic has no `parentInstanceName`.

#### `topicClass.createInstance(context: BotContext, parentInstanceName: TopicInstance, args?): Promise<string>`

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
        await this.dispatch(context, this.state.child);
    });

// Scalable web services

class MyTopic extends TopicClass<InitArgs, State, ReturnArgs> {
    async init(context: BotContext, instance: TopicInstance<State, ReturnArgs>, args?: InitArgs) {
        instance.state = {
            foo: args.foo,
            bar: 15                                 // error
        }
        this.returnToParent({
            foo: instance.state.bar                 // error
        })
    }
}

class myTopic = new MyTopic();

class YourTopic extends Topic {
    constructor (name?: string) {
        super(name);

        this.onChildReturn(myTopic, (context, instance, childInstance) => {
            context.reply(childInstance.returnArgs.bar);                // error
        })
    }
    async init(context: BotContext, instance: TopicInstance) {
        instance.state.child = await myTopic.createInstance(context, instance, {
            bar: "hey"                              // error
        });
    }
    async onReceive(context: BotContext) {
        await this.dispatch(context, instance.state.child);
    }
}
``
</s>