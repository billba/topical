
# Understanding Topical

## "Conceptual" and "Turn" Instances

In a *Topical* application, the conversational state for a given user in a conversation is represented as a dynamic heirarchy of instances of subclasses of `Topic`.

We call these *conceptual instances*, because in a distributed system this heirarchy of instances is stored in a centralized state store. On each turn, instance data is loaded in from the state store, instances of `Topic` subclasses (*turn instances*) are constructed as needed, and the updated instance data is saved back to the state store at the end of the turn.

## Subtopics, and Registration

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

## Subtopic construction & lifecycle

*Topical* constructs turn instances of `Topic` subclasses for you, as follows:

In any method of a given topic, you *begin* a subclass of `Topic` of by calling `this.beginChild(SubclassOfTopic, beginArgs?, constructorArgs?)`. This:

* creates a conceptual instance of `SubclassOfTopic`, including a unique name. This will be persisted to the state store at the end of the turn
* calls `new SubclassOfTopic(constructorArgs)`, sets its `.instanceName` and `.state`, and calls its `.onBegin(beginArgs)`
* sets `this.children[0]` of the calling turn instance to the `.instanceName` of the just-created turn instance of `SubclassOfTopic`

Subsequently (either in the same turn or on a later turn) you can call `this.dispatchToChild()`, usually (but not always) from within the `onTurn` method of a given topic. This:

* gets the conceptual instance name from the turn intance of the method's topic's `this.children[0]`
* loads the conceptual instance from the state store
* looks up `SubclassOfTopic` in *Topical*'s Registration map
* calls `new SubclassOfTopic(constructorArgs)`, sets its `.instanceName` and `.state`, and calls its `.onTurn()`

As you can see, `new SubclassOfTopic(constructorArgs)` may happen multiple times over the lifetime of the conceptual instance. As a result, `SubclassOfTopic`'s constructor should only do things that make sense both for beginning and dispatching `SubclassOfTopic`, and `constructorArgs` should only contain arguments necessary to *construct* a turn instance of `SubclassOfTopic`.

Many subclasses of `Topic` don't need a constructor at all.




When it's called the first time, `YourRootTopic.begin`:
* throws if `Topic.init` hasn't already been called
* calls `YourRootTopic.register()`, recursively registering `YourRootTopic`, its subtopics, all *their* subtopics, and so on.

On every call `YourRootTopic.begin`:
* begins a conceptual instance of `YourRootTopic` (as noted above, this calls `.onBegin(beginArgs)`)
* sets it as your root topic instance

On every call `YourRootTopic.onTurn`:
* dispatches to the root topic instance (as noted above, this calls `.onTurn()`)
