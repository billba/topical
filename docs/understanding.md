
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

interface TopicInstance {
    topicInstanceName: string;
    children: string[];

    topicClassName: string;
    constructorArgs: any,

    state: any;

    begun: boolean;
}
```

`topicInstances` is a dictionary of `TopicInstance`s, indexed by their (unique) `topicInstanceName`. Each `TopicInstance` has a `children` array of `topicInstanceName`s in, and `rootTopicInstanceName` is the `topicInstanceName` of the root.

(To traverse the tree, start with the `rootTopicInstanceName`, look up its `TopicInstance` in `topicInstances`, and do the same recursively with each member of its `children`.)

## `Topic`, its subclasses, and the class registry.

Topics come in different flavors, each with its own behaviors and state shapes. In *Topical* these are implemented as subclasses of the class `Topic`.

A *Topical* application is a collection of such classes, which are registered by name into a dictionary at application startup. That name corresponds to the `topicClassName` field of each `TopicInstance`.

## Registration and Subtopics

The way registration works is that each subclass of `Topic` declares all the *other* subclasses of `Topic` that are potential children for that topic.

In TypeScript, within your class, you do:

```ts
static subtopics = [ChildTopic, AnotherChildTopic];
```

In plain JavaScript you need to do the following *after* your class definition:

```ts
YourTopicHere.subtopics = [ChildTopic, AnotherChildTopic];
```

When `YourRoootTopic.begin` is called the firs time, `YourRootTopic` and its subtopics are automatically registered. This process is recursive. In other words if `ChildTopic` declares subtopic `GrandchildTopic`, that will be registered too, and so on.

## Working with topics

**You never construct instances your `Topic` subclasses yourself.** Instead, *Topical* does it for you, using the `topicInstanceName` to look up the `TopicInstance`, then using its `topicClass` to look up the actual class, then constructs it for you using `constructorArgs` as the argument to its constructor.

## Topic creation & lifecycle

### Creating a topic

You create a topic by calling

```ts
const topicInstanceName = YourTopicHere.createTopicInstance(context, constructorArgs);
```

A `TopicInstance` is created with `constructorArgs` and a unique `topicInstanceName`. Its `topicClassName` is set to `YourTopicHere`. `children` is set to an an empty array, `state` is set to an empty object, and `begun` is set to false. This `TopicInstance` is then added to the `topicInstances` dictionary using `context`. 

If you're already in a topic, you can achieve the same results by calling:

```ts
const topicInstanceName = this.createTopicInstance(YourTopicHere, constructorArgs);
```

## Loading a topic

Once a topic has been created, you can ask *Topical* to construct an instance of its class:

```ts
const topic = this.loadTopic(child);
```

### Beginning a topic

Once a topic has been created, and loaded, you can begin it:

```ts
const ongoing = await topic.begin(beginArgs);
```

*Topical* calls `topic.onBegin(beginArgs)`. If `onBegin` called `returnToParent()` then its `TopicInstance` is deleted, and `begin` returns false. Otherwise `begin` returns true.

The exception is the root topic, which has no parent. So you have to do:

```ts
const topic = await Topic.beginTopicInstance(context, topicInstanceName, beginArgs);
```

As a convenience, you can create and begin a child topic in one fell swoop:

```ts
const topic = await this.createAndBeginTopicInstance(YourTopicHere, beginArgs, constructorArgs);
```

This returns the resultant topic, or `undefined` if `onBegin` called `returnToParent()`.

Finally, if you have a single-child topic, you can create, begin, and set a child topic (potentially replacing another one) all at once.

```ts
await this.beginChild(YourTopicHere, beginArgs, constructorArgs);
```

## Triggering a topic

Once a topic has been created, but not yet begun, you can query it to see if it thinks it should be begun based on the current activity.

```ts
const topic = this.loadTopic(child);

const result = topic.trigger();
```

This result of `trigger` is either `undefined` or an object containing 0 > `score` <= 1, representing the topic's confidence that the current activity should begin it, and the `beginArgs` that should be supplied to its `begin` method in that case.

You can use this result however you see fit, including comparing the score to that of other topics. If you have just one topic, you can just do:

```ts
if (result)
    await topic.begin(result.beginArgs);
```

A shorthand for this case is:

```ts
await topic.beginIfTriggered();
```

This returns true if the topic was begun, false if the topic was not begun, or begun and completed.

Not all topics have triggers. If not, calling `trigger()` will return a score of 0.

### Dispatching to a topic

From any topic, dispatch the current activity to a different topic:

```ts
await this.dispatchTo(topicInstanceName);
```

*Topical* constructs an instance of the appropriate class and calls `topic.onTurn()`, and returns `true`. If you pass in `undefined`, it returns `false`.

If you have a single-child topic you can do,

```ts
await this.dispatchToChild();
```

This returns 'false' if there is currently no child.

## Topic constructors

*Topical* may construct a topic for a `TopicInstance` many times over its lifetime, across multiple turns. Topics are constructed for `trigger`ing, `begin`ning, and `dispatch`ing. 

As a result, a topic's constructor should only do things that make sense in all these situations, and `constructorArgs` should only contain arguments necessary to do those things.

Much of what would normally goes in a constructor (like initializing the internal state at startup based on a set of arguments) instead happens in the `onBegin` method. In fact, many subclasses of `Topic` don't need a constructor at all.

## Hooking up *Topical* to your main message loop:

Commonly you will do something like:

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

`YourRootTopic.begin` should be called once for each conversation.

The *first time* it's called, `YourRootTopic.begin` calls `YourRootTopic.register()`, recursively registering `YourRootTopic`, its subtopics, all *their* subtopics, and so on.

On every call, `YourRootTopic.begin`:
* creates a `TopicInstance` of `YourRootTopic`, begins it, and sets it as your root topic instance

On every call `YourRootTopic.onTurn`:
* dispatches to the root topic instance

