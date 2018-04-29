# *Topical* patterns

The *Topics* pattern is intentionally very general purpose, enabling a number of different patterns. This page will attempt to document known patterns -- if you find a new one, pleae add it here!

## Single Active Child

This is the simplest and most common pattern. A topic's `this.children` array is initially empty. A trigger event causes a child to be started and set as the sole member of `this.children`. When this is the case, subsequent activities are dispatched to the child, which continues until the child topic completes by calling its `this.returnToParent()` method with or without a return value, at which point the parent topic's `this.children` array is cleared (emptied), and the cycle can be repeated.

```ts
class Root extends Topic {

    async onStart() {
        await this.send("How can I help you today?");
    }

    async onDispatch() {
        if (await this.dispatchToChild())
            return;

        if (this.text === "book travel") {
            await this.startChild(TravelTopic);
        }
    }

    async onChildReturn() {
        await this.send(`Welcome back to the Root!`);
        this.clearChildren();
    }
}
Root.register();
```

## Intercepted Messages

Sometimes you want a parent topic to intercept certain messages and handle them rather than dispatching them to the child:
```ts
    async onDispatch() {
        if (this.text === 'time') {
            await this.send(`The current time is ${new Date().toLocaleTimeString()}.`);
            return;
        }

        if (await this.dispatchToChild())
            return;

        if (this.text === "book travel") {
            await this.startChild(TravelTopic);
        }
    }
```

## Child cancelation

Sometimes you want a parent to permanently stop dispatching messages to its child. This is as simple as clearing `this.children`.

```ts
    async onDispatch() {
        if (this.text === `cancel`)
            this.clearChildren();

        if (await this.dispatchToChild())
            return;

        if (this.text === "book travel") {
            await this.startChild(TravelTopic);
        }
    }
```

**Note:** it is likely that `Topic` will get an `onEnd` method so that a child topic has an opportunity to clean up when it is ended by a parent.

## Triggering

Sometimes a child knows better than its parent whether it should be triggered. In this scenario, the child needs to be *created* but not *started*.

```ts
class Root extends Topic {

    async onStart() {
        this.setChild(this.createTopicInstance(TravelTopic));

        await this.send("How can I help you today?");
    }

    async onDispatch() {
        if (await this.dispatchToChild())
            return;

        const topic = await this.loadTopic(this.child);

        const result = await topic.getStartScore();

        if (result)
            await topic.start(result.startArgs);
    }

    async onChildReturn() {
        await this.send(`Welcome back to the Root!`);
        this.clearChild();
    }
}
Root.register();
```
`Topic` contains a helper called `startIfScore` that does this for you:
```ts
    async onDispatch() {
        if (await this.dispatchToChild())
            return;

        await startIfScore(await this.loadTopic(this.child));
    }
```

If you have multiple children, the helper `startBestScoringChild` will try every child in `this.children` and start the one returning the highest score, so you can load up a number of potential children and let them duke it out. See this in action in the [triggers](../samples/triggers.ts) sample.

## Prompts

Read up on [prompts](./prompts.md)

## Waterfalls

Read up on [waterfalls](./waterfalls.md)

## Confirmation

TK

## Resolving ambiguity

TK

