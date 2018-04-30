
# Understanding Topical

## `TopicInstance`

The *Topics* pattern models each conversation as a dynamic tree of independent conversational topics, each with its own state.

Because the typical BotBuilder app is implemented as a distributed, load-balanced web service, this tree is persisted to a centralized store (in a non-distrubuted app, this can be an in-memory store). The tree is read into memory at the start of a turn, operations are performed which may alter it, and the updated tree is written back to the store at the end of the turn.

The tree is represented as follows:

```ts
interface TopicalConversation {
    topicInstances: Record<string, TopicInstance>,
    rootTopicInstanceName: string;
}

enum TopicLifecycle {
    created,
    started,
    ended,
}

interface TopicInstance {
    topicInstanceName: string;
    children: string[];

    topicClassName: string;
    constructorArgs: any,

    state: any;

    lifecycle: TopicLifestyle;
}
```

`topicInstances` is a dictionary of `TopicInstance`s, indexed by their (unique) `topicInstanceName`. Each `TopicInstance` has a `children` array of `topicInstanceName`s in, and `rootTopicInstanceName` is the `topicInstanceName` of the root.

(To traverse the tree, start with the `rootTopicInstanceName`, look up its `TopicInstance` in `topicInstances`, and do the same recursively with each member of its `children`.)

## `Topic`, its subclasses, and the class registry.

Topics come in different flavors, each with its own behaviors and state shapes. In *Topical* these are implemented as subclasses of the class `Topic`.

A *Topical* application is a collection of such classes, which are registered by name into a dictionary at application startup. That name corresponds to the `topicClassName` field of each `TopicInstance`.

## Registration and Subtopics

After declaring your subclass of `Topic`, you must register it.

```ts
class MyTopic extends Topic {
    ...
}
MyTopic.register();
```

## Working with topics

**You never construct instances of your `Topic` subclasses yourself.** Instead, *Topical* does it for you, using the `topicInstanceName` to look up the `TopicInstance`, then using its `topicClass` to look up the actual class, then constructs it for you using `constructorArgs` as the argument to its constructor.

## Topic creation & lifecycle

### Creating a topic

You create a topic by calling

```ts
const topicInstanceName = YourTopicHere.createTopicInstance(context, constructorArgs);
```

A `TopicInstance` is created with `constructorArgs` and a unique `topicInstanceName`. Its `topicClassName` is set to `"YourTopicHere"`. `children` is set to an an empty array, `state` is set to an empty object, and `lifecycle` is set to `TopicLifecycle.created`. This `TopicInstance` is then added to the `topicInstances` dictionary using `context`. 

If you're already in a topic, you can achieve the same results with slightly fewer characters by calling:

```ts
const topicInstanceName = this.createTopicInstance(YourTopicHere, constructorArgs);
```

### Loading a topic

Once a topic has been created, you can ask *Topical* to construct an instance of its class:

```ts
const topic = this.loadTopic(topicInstanceName);
```

### Recreating a topic

You can return a topic to its "just created" state:

```ts
topic.recreate();
```

This clears its children, empties `state`, and sets the `lifecycle` to `created`.

Now the topic is ready to be `start`ed.

### Starting a topic

Once a topic has been created, and loaded, you can start it:

```ts
await topic.start(startArgs);
```

*Topical* calls `topic.onStart(startArgs)` (and does some other stuff).

As a convenience, you can create and start a child topic in one fell swoop:

```ts
const topic = await this.createTopicInstanceAndStart(YourTopicHere, startArgs, constructorArgs);
```

This returns the resultant topic.

Keep in mind that a topic can end itself in its `onStart` method.

If you have a single-child topic, you can create, start, and set a child topic (potentially replacing another one) all at once.

```ts
await this.startChild(YourTopicHere, startArgs, constructorArgs);
```

In this case, if the child topic ended itself, `this.child` is set to `undefined`.

### Restarting a topic

Any topic can be restarted by calling `topic.start`/`this.startChild`. This calls `recreate` if the topic's lifecycle is not `created`.

### Ending a topic

A topic can end itself:

```ts
await this.end(returnArgs);
```

This sets the topic's `lifecycle` to `ended`, clears its children, and sets its `return` property to `returnArgs`. Then, if the topic has a parent, it calls that parent's `onChildReturn` method.

An ended topic can always be recreated or restarted.

### Dispatching to a topic

From any topic, dispatch the current activity to a different topic:

```ts
await this.dispatchTo(topicInstanceName);
```

*Topical* constructs an instance of the appropriate class and calls `topic.onDispatch()`, and returns `true`. If you pass in `undefined`, it returns `false`.

If you have a single-child topic you can do,

```ts
await this.dispatchToChild();
```

This returns 'false' if there is currently no child.

### Dispatching an activity

Sometimes you want to dispatch an activity other than the current one. For instance, if the user said something ambiguous you might want to sock it away in your state, ask for clarification, and then recall it and dispatch it. Just do:

```ts
await this.dispatchTo(topicInstanceName, activity_you_saved);
```

or

```ts
await this.dispatchToChild(activity_you_saved);
```

## Topic constructors

*Topical* may construct a topic for a `TopicInstance` many times over its lifetime, across multiple turns. Topics are constructed for scoring, `start`ing, and `dispatch`ing, or calling any other method that may exist on them.

As a result, a topic's constructor should only do things that make sense in all these situations, and `constructorArgs` should only contain arguments necessary to do those things.

Much of what would normally goes in a constructor (like initializing the internal state at startup based on a set of arguments) instead happens in the `onStart` method.

Many subclasses of `Topic` won't need a constructor at all.

## Hooking up *Topical* to your main message loop:

Commonly you will do something like:

```ts
yourMessageLoop(async context => {
     if (context.activity.type === 'conversationUpdate') {
        for (const member of context.activity.membersAdded) {
            if (member.id != context.activity.recipient.id) {
                await YourRootTopic.start(context, startArgs, constructorArgs);
            }
        }
    } else {
        await YourRootTopic.onDispatch(context);
    }
});
```

`YourRootTopic.start` should be called once for each conversation.

On every call, `YourRootTopic.start`:
* creates a `TopicInstance` of `YourRootTopic`, starts it, and sets it as your root topic instance

On every call `YourRootTopic.onDispatch`:
* dispatches to the root topic instance

