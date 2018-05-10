
# Understanding Topical

## `TopicInstance`

The *Topics* pattern models each conversation as a dynamic tree of independent conversational topics, each with its own state.

Because the typical BotBuilder app is implemented as a distributed, load-balanced web service, this tree is persisted to a centralized store (in a non-distrubuted app, this can be an in-memory store). The tree is read into memory at the start of a turn, operations are performed which may alter it, and the updated tree is written back to the store at the end of the turn.

The tree is represented as a classic data structure. Each `TopicNode` contains a dictionary of named children. 

```ts
interface TopicalConversation {
    root: TopicNode;
}

interface TopicNode {
    children: Record<string, TopicNode>;

    className: string;
    constructorArgs: any;

    state: any;

    lifecycle: TopicLifecycle;
}

enum TopicLifecycle {
    created,
    started,
    ended,
    removed,
}
```

## `Topic`, its subclasses, and the class registry.

Topics come in different flavors, each with its own behaviors and state shapes. In *Topical* these are subclasses of the class `Topic`. A *Topical* application is a collection of such classes, which are registered by name into a dictionary at application startup. That name corresponds to the `className` field of each `TopicNode`.

## Registration

After declaring your subclass of `Topic`, you must register it.

```ts
class MyTopic extends Topic {
    ...
}
MyTopic.register();
```

## Working with topics

**You never construct instances of your `Topic` subclasses yourself.** Instead, *Topical* does it for you, using the `className` to look up the actual class, then constructs it for you using `constructorArgs` as the argument to its constructor.

## Topic creation & lifecycle

### Creating a topic

You create a topic by calling

```ts
const topic = await Topic.createTopicInstance(YourTopicHere, context, constructorArgs);
```

A `TopicNode` is created with `constructorArgs`. Its `className` is set to `"YourTopicHere"`. `children` and `state` are empty, and `lifecycle` is set to `TopicLifecycle.created`. An instance of `YourTopicHere` is created with `constructorArgs`, its `onCreate` method is called, and the instance is returned.

This is a low-level API. You would almost always instead do the following from within a topic:

```ts
const topic = await this.createChild(YourTopicHere, constructorArgs);
```

This does all of the above, and also assigns the `TopicNode` to `this.children['YourTopicHere']`.

### Loading a topic

At any time, you can ask *Topical* to construct an instance of the `Topic` subclass associated with a node:

```ts
const topic = await Topic.loadTopic(context, topicInstanceName);
```

Again, this is a low-level API. You would almost always instead do the following from within a topic:

```ts
const topic = await this.loadChild(YourTopicHere);
```

In this case `loadChild` attempts to load a child named `"YourTopicHere"` and will throw if it can't find one, or if that node doesn't have a `className` of `"YourTopicHere"`.

### Recreating a topic

You can return a topic to its "just created" state:

```ts
await topic.recycle();
```

This clears its children, empties `state`, and sets the `lifecycle` to `created`.

Now the topic is ready to be `start`ed.

### Starting a topic

Once a topic has been created, and loaded, you can start it:

```ts
await topic.start(startArgs);
```

Among other things, this calls `topic.onStart(startArgs)`.

More commonly, you'd call:

```ts
const topic = await this.startChild(YourTopicHere, startArgs, constructorArgs);
```

Usefully, if the child doesn't already exist, it is created.

Keep in mind that by the time `start` returns, the topic may have ended itself.

### Restarting a topic

Any topic can be restarted by calling `topic.start`/`this.startChild`. This calls `recycle` if the topic's lifecycle is not `created`.

### Ending a topic

A topic can end itself:

```ts
await this.end(returnArgs);
```

And a parent can end a child:

```ts
await this.endChild(YourTopicHere, returnArgs);
```

This sets the topic's `lifecycle` to `ended`, removes its children, and sets its `return` property to `returnArgs`. Then, if the topic has a parent, it calls that parent's `onChildEnd` method.

An ended topic can always be recycled or restarted.

### Removing a child

When you know you don't want a child any more, remove it:

```ts
await this.removeChild(YourTopicHere);
```

This calls the child's `onRemove()` method, and then removes the reference to that child from the node's `children`.

### Dispatching to a topic

From any topic, dispatch the current activity to a given child:

```ts
const dispatched = await this.dispatchToChild(YourTopicHere);
```

This returns `true` if `YourTopicHere` is `started`, `false` otherwise.

You can list several children. `dispatchToChild` will iterate through them in order, and dispatch to the first one that's `started`:

```ts
const dispatched = await this.dispatchToChild(YourTopicHere, AnotherTopic, ThisOneToo);
```

If you don't give any topics, `dispatchToChild` will do the same thing for the node's `children`, but not in a predictable order.

```ts
const dispatched = await this.dispatchToChild();
```

### Dispatching an activity

Sometimes you want to dispatch an activity other than the current one. For instance, if the user said something ambiguous you might want to sock it away in your state, ask for clarification, and then recall it and dispatch it. Just do:

```ts
await this.dispatchToChild(activity_you_saved, YourTopicHere);
```

You can do this with multiple topics:

```ts
await this.dispatchToChild(activity_you_saved, YourTopicHere, AnotherTopic, ThisOneToo);
```

... or with all the node's `children`


```ts
await this.dispatchToChild(activity_you_saved);
```

## Topic constructors

*Topical* may construct a topic for a `TopicInstance` many times over its lifetime, across multiple turns. Topics are constructed for scoring, `start`ing, and `dispatch`ing, or calling any other method that may exist on them.

As a result, a topic's constructor should only do things that make sense in all these situations, and its arguments should only contain arguments necessary to do those things.

Much of what would normally goes in a constructor (like initializing the internal state at startup based on a set of arguments) instead happens in the `onCreate` and `onStart` methods.

Many subclasses of `Topic` won't need a constructor at all.

## Hooking up *Topical* to your main message loop:

Commonly you will do something like:

```ts
yourMessageLoop(async context => {
     if (context.activity.type === 'conversationUpdate') {
        for (const member of context.activity.membersAdded) {
            if (member.id === context.activity.recipient.id) {
                await YourRootTopic.start(context, startArgs, constructorArgs);
            }
        }

    await YourRootTopic.onDispatch(context);

});
```

`YourRootTopic.start` should be called once for each conversation.

On every call, `YourRootTopic.start`:
* creates a `TopicInstance` of `YourRootTopic`, starts it, and sets it as your root topic instance

On every call `YourRootTopic.onDispatch`:
* dispatches to the root topic instance

