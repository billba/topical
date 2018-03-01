# Topical

*Topical* is a framework for modeling conversations in [Microsoft BotBuilder 4.x](https://github.com/microsoft/botbuilder-js) using the *Topics* pattern.

***Topical* is an experimental framework, not a supported Microsoft product. Use at your own risk.**

**Like BotBuilder 4.x, *Topical* is in rapid development, and every aspect is subject to change in upcoming versions.**

## How do I install *Topical*?

`npm install -S botbuilder-topical`

## The *Topics* pattern

The Topics pattern models conversations as a dynamic heirarchy of independent conversational topics. Messages pass down through the heirarchy, each topic handling the message and/or passing it on to a child topic as it sees fit. A child topic notifies its parent when it's done.

![Topics](/Topics.gif)

The Topical library is simply meant to provide low-level support for this pattern. Classes are provided for two kinds of applications: standard applications and scaleable web services.

## Standard applications

For single-user in-process applications, the Topics pattern is easily implemented with traditional object-oriented programming.

Topical supplies a [`Topic`](/src/Topic.ts) class. Here's a simple version of the Root topic illustrated above: 

```ts
class RootTopic extends Topic {
    async init(context) {
        context.reply("How can I help you today?");
    }
    async onReceive(context) {
        if (this.state.child)
            return this.state.child.onReceive(context);

        if (context.request.text === "book travel") {
            this.state.child = await new TravelTopic(context, async () => {
                context.reply(`Welcome back to the Root!`);
                this.state.child = undefined;
            });
            
            await this.state.child.init();
        }
    }
}
```

## Scaleable web services

Traditional object-oriented programming won't work for many-users-to-many-instances web apps. The heirarchy of topics for each conversation must be maintained in a centralized store. Moreover, child topics may complete in entirely different instances (and in extended timeframes), making it impossible to utilize traditional completion handlers.

Topical supplies a [`TopicClass`](/src/TopicClass.ts) class, which models traditional object-oriented programming in a distributed system:

* Each topic "class" is created just once per application instance at startup, using a unique id to correlate the same topic class across application instances.
* "Methods" are added to a class using a fluent interface.
* Each "instance" of a class is created in the centralized store, each referencing the id of its class.
* Completion handlers are implemented as listener methods.

In this way, each turn can be very efficiently executed on a given instance of your application.

The *Topical* version of the above code reads:

```ts
const intranetTopicClass = new TopicClass('intranet')
    .init(async (context) => {
        context.reply("How can I help you today?");
    })
    .onReceive(async (context, topicContext) => {
        if (topicContext.instance.state.child)
            return topicContext.dispatchToInstance(topicContext.instance.state.child);

        if (context.request.text === "book travel")
            topicContext.instance.state.child = await topicContext.createTopicInstance(travelTopicClass);
    })
    .onChildReturn(travelTopicClass, async (context, topicContext) => {
        context.reply(`Welcome back to the Intranet bot!`);
        topicContext.instance.state.child = undefined;
    });
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

Honestly it's really very straightforward.

## Overly Quick Reference for `TopicClass`

### Topic*Context

Each Topic method is provided a `Topic*Context` (each method has a slightly different type) object with properties and methods relevant to the topic and method. Here are the common values:

### `topicContext.instance`

This object is retrieved from a store and cached in memory via the `BotStateManager` ORM. At the end of the turn the new contents are persisted back out to the store. It contains:

#### `topicContext.instance.state`

Each instance of a topic has its own state. This will ultimately be persisted as JSON, so you should restrict yourself to JSON-compatible types (e.g. no functions or `Date`s).

#### `topicContext.instance.name`

The id of the instance. This is the key used to retrieve and save the instance in the store.

#### `topicContext.instance.topicName`

The name of the Topic of which this is an instance. This is the key used to corrolate Topic classes across all app instances.

#### `topicContext.instance.parentInstanceName`

The id of the parent's instance. Only the root topic has no `parentInstanceName`.

#### `topicContext.createTopicInstance(topicClass: TopicClass, args?): Promise<string>`

Creates an instance of `topicClass` and returns its instance id. Typically you would store this somewhere in the topic state for later use in dispatching messages. You may optionally pass an object which will be provided to the topic's `.init()` method. 

#### `topicContext.dispatchToInstance (instanceName: string): Promise<void>`

Calls the `.onReceive()` method of the instance named. Note that you do not pass `context` yourself -- it is passed automatically.

#### `topicContext.rootInstanceName`

The id of the instance for the root topic. Useful for calling the `.next()` method of the root topic.

### TopicClass Methods

When creating a Topic Class you may provide any or all of the following fluent methods:

#### `TopicClass.init(context, topicContext, topicContext: TopicContext)`

Run after the Topic instance is created. This is where you can set up your initial state, perhaps using the (optional) arguments provided when the instance was created, accessible via . This is also a good place to send a welcome message.

The `topicContext` passed to `.init()` provides the follow additional functionality:

##### `topicContext.args`

These are optional arguments passed via `topicContext.createTopicInstance()`. These will typically be used to set up the initial state of the instance. `args` are not available after `.init()` is run, so make sure you put anything you might need into the instance state.

*As your last action in `.init()`, you may optionally call **one** of the following three methods:*

##### `topicContext.returnToParent(response)`

deletes the instance and sends `response` to the parent topic's `onChildReturn()` handler.

##### `topicContext.dispatchToSelf()`
 
Calls the `.onReceive()` method of the current instance. Note that you do not pass `context` yourself -- it is passed automatically.

This is useful when you want your `onReceive()` logic to act on the same message that was used to create the instance.

##### `topicContext.next()`
 
Calls the `.next()` method of the current instance. Note that you do not pass `context` yourself -- it is passed automatically.

#### `TopicClass.next()`

This is useful when you want to share "next action" logic between your `.init()` and `.onReceive()` methods. See it in use in [SimpleForm](/src/forms.ts).

#### `TopicClass.onReceive(context: BotContext, topicContext: TopicContext)`

Run for each activity dispatched to the topic instance.

*As your last action in `.onReceive()`, you may optionally call **one** of the following two methods (as documented above)*

##### `topicContext.returnToParent(response)`
##### `topicContext.next()`

#### `TopicClass.onChildReturn(topicClass: TopicClass, (context: BotContext, topicContext: TopicContext) => void | Promise<void>)`

This is where you put completion handlers for each child topic. It is called after the instance is closed by calling its `returnToParent()` function.

If you have multiple children that are instances of the same topic (common for prompts) then you will have to disambiguate the responses. `StringPrompt`, for example, carries an optional `name` property for this purpose.

The `topicContext` passed to `.init()` provides the follow additional functionality:

##### `topicContext.args`

This is the `response` object provided to `returnToParent(response)`

##### `topicContext.childInstanceName`

This is the id of the child instance. By this point the actual instance has been deleted, but its name is provided in case the topic needs it to clean up its state. For instance, the topic might store its children in a map, and so it might need to do:

```ts
.onChildReturn(childTopic, (context, topicContext) => {
    // handle response
    delete topicContext.instance.state.children[topicContext.childInstanceName]
})
```
*As your last action in `.onReceive()`, you may optionally call **one** of the following two methods (as documented above)*

##### `topicContext.returnToParent(response)`
##### `topicContext.next()`

#### `TopicClass.afterChildReturn(topicClass: TopicClass, (context: BotContext, topicContext: TopicContext) => void | Promise<void>)`

This is called after every call to `.onChildReturn()`. It is intended for cleanup activities common to all completion handlers, and (critically) has access to `topicContext.childInstanceName`. Using the example above:

```ts
.onChildReturn(childTopic1, ...)
.onChildReturn(childTopic2, ...)
.onChildReturn(childTopic3, ...)
.afterChildReturn(childTopic, (context, topicContext) => {
    delete topicContext.instance.state.children[topicContext.childInstanceName]
});
```

### TopicClass typing

TypeScript users may specify types for the arguments to, state of, and response from, a topic class:

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

const myTopic = new TopicClass<InitArgs, State, ReturnArgs>('myTopic')
    .init((context, topicContext) => {
        topicContext.instance.state = {
            foo: topicContext.args.foo,
            bar: 15                                 // error
        }
        topicContext.returnToParent({
            foo: topicContext.instance.state.bar     // error
        })
    })

interface YourState {
    child: string;
}

const yourTopic = new TopicClass<undefined, YourState, undefined>('yourTopic')
    .init(async (context, topicContext) => {
        topicContext.instance.state.child = await topicContext.createTopicInstance(myTopic, {
            bar: "hey"                              // error
        });
    })
    .onReceive(async (context, topicContext) => {
        if (topicContext.instance.state.child)
            return topicContext.dispatchToInstance(topicContext.instance.state.child);
    })
    .onChildReturn(myTopic, (context, topicContext) => {
        context.reply(topicContext.args.bar);       // error
    })
```