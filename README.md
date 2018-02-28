# Topical

The *Topics* pattern models conversations as a dynamic heirarchy of independent conversational topics. Messages pass down through the heirarchy, each topic handling the message and/or passing it on to one or more child topics as it sees fit.

*Topical* is a framework for modeling conversations using the Topics pattern in [Microsoft BotBuilder 4.x](https://github.com/microsoft/botbuilder-js).

***Topical* is an experimental framework, not a supported Microsoft product. Use at your own risk.**

## How do I install *Topical*?

`npm install -S botbuilder-topical`

## Why *Topical*?

For single-user in-process applications, something like *Topical* could easily be built with traditional object-oriented programming, with each `Topic` defined as a class with an asynchronous completion handler and methods for starting and handling each message. A given topic creates children and/or dispatches messages to them, as appropriate, e.g.:

```ts
class IntranetTopic extends Topic {
    async onReceive(context) {
        if (this.child)
            return this.child.onReceive(context);

        if (context.request.text === "book travel") {
            this.child = new TravelTopic(context, async () => {
                context.reply(`Welcome back to the Intranet bot!`);
                this.child = undefined;
            }).init();
        }
    }
}
```

However this won't work for many-users-to-many-instances web apps. The heirarchy of topics for each conversation must be maintained in a centralized store.

*Topical* models traditional object-oriented programming in a distributed system:

* Each Topic "class" is created on each instance of your app, just once at startup, by calling `new TopicClass('id')`
* "methods" are added to a class using a fluent interface.
* Each class is created with a unique id. This corrolates the classes (and thus their methods) across every instance of your app.
* Each "instance" of a class (along with its state) is created in the centralized store, each referencing the id of its class.
* Completion handlers are implemented as listener methods.

In this way, each turn can be very efficiently executed on a given instance of your application.

The *Topical* version of the above code reads:

```ts
const intranetTopicClass = new TopicClass('intranet')
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

It's up to you, but the idea is that each Topic maps to a topic of conversation (thus the name). For instance, a *Travel* topic would handle general conversations about travel, but when the user is ready to book a flight it would spin up a child *Flight* topic, and start dispatching incoming messages to that child. Furthermore *Flight* might delegate messages to an *Airport Picker* topic.

An important detail is that delegation doesn't have to be all or nothing -- Travel could continue answering specific questions it recognizes, e.g. "Is it safe to travel to Ohio?", and pass the rest on to Flight. This is why each message travels down from the top of the topic heirarchy.

Midway through booking a flight, a user might want to look into hotels. *Travel* could recognize that question and spin up a *Hotel* topic. How does *Travel* know where to send subsequent messages? That is the interesting part. *Topical* provides the structure, you provide the logic.

## Do you have samples?

The [simple sample](/samples/simple.js) is a JavaScript bot demonstrates a simple conversation with parent-child topics. To run it:

* clone this repo
* `node samples/simple.js`

The [alarm bot](/samples/alarmBot.ts) is a TypeScript bot with a little more depth. To run it:

* clone this repo
* `npm install`
* `npm run build`
* `node lib/samples/alarmBot.js`

## Can I publish my own Topics?

Please do! [SimpleForm](/src/forms.ts) is a (simple) example of a Topic that is of general use (it's used by the alarm bot). It demonstrates how to use another Topic (StringPrompt) without topic id namespace collisions.

## Overly Quick Reference


### TopicContext

Each Topic method is provided a `Topic*Context` (each method has a slightly different type) object with properties and methods relevant to the topic. Here are the common values:

### `topicContext.instance`

This object is retrieved from a store and cached in memory via the `BotStateManager` ORM. At the end of the turn the new contents are persisted back out to the store. It contains:

#### `topicContext.instance.state`

Each instance of a topic has its own state. This will ultimately be persisted as JSON, so you should restrict yourself to JSON-compatible types (e.g. no functions or `Date`s).

#### `topicContext.instance.name`

The id of the instance. This is the key used to retrieve and save the instance in the store.

#### `topicContext.instance.name`

The name of the Topic of which this is an instance. This is the key used to corrolate Topic classes across all app instances.

#### `topicContext.instance.parentInstanceName`

The id of the parent's instance. Only the root topic has no `parentInstanceName`.

#### `topicContext.instance.parentInstanceName`

#### `topicContext.createTopicInstance(topicClass: TopicClass, args?): Promise<string>`

Creates an instance of `topicClass` and returns its instance id. Typically you would store this somewhere in the topic state for later use in dispatching messages. You may optionally pass an object which will be provided to the topic's `.init()` method. 


#### `topicContext.dispatchToInstance (instanceName: string): Promise<void>`

Calls the `.onReceive()` method of the instance named. Note that you do not pass `context` yourself -- it is passed automatically.

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