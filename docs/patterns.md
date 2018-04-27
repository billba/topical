# *Topical* patterns

The *Topics* pattern is intentionally very general purpose, enabling a number of different patterns. This page will attempt to document known patterns -- if you find a new one, pleae add it here!

## Single Active Child

This is the simplest and most common pattern. A topic's `this.children` array is initially empty. A trigger event causes a child to be started and set as the sole member of `this.children`. When this is the case, subsequent activities are dispatched to the child, which continues until the child topic completes by calling its `this.returnToParent()` method with or without a return value, at which point the parent topic's `this.children` array is cleared (emptied), and the cycle can be repeated.

```ts
class Root extends Topic {

    async onBegin() {
        await this.this.send("How can I help you today?");
    }

    async onTurn() {
        if (await this.dispatchToChild())
            return;

        if (this.text === "book travel") {
            await this.beginChild(TravelTopic);
        }
    }

    async onChildReturn() {
        await this.this.send(`Welcome back to the Root!`);
        this.clearChildren();
    }
}
Root.register();
```

## Intercepted Messages

Sometimes you want a parent topic to intercept certain messages and handle them rather than dispatching them to the child:
```ts
    async onTurn() {
        if (this.text === 'time') {
            await this.this.send(`The current time is ${new Date().toLocaleTimeString()}.`);
            return;
        }

        if (await this.dispatchToChild())
            return;

        if (this.text === "book travel") {
            await this.beginChild(TravelTopic);
        }
    }
```

## Child cancelation

Sometimes you want a parent to permanently stop dispatching messages to its child. This is as simple as clearing `this.children`.

```ts
    async onTurn() {
        if (this.text === `cancel`)
            this.clearChildren();

        if (await this.dispatchToChild())
            return;

        if (this.text === "book travel") {
            await this.beginChild(TravelTopic);
        }
    }
```

**Note:** it is likely that `Topic` will get an `onEnd` method so that a child topic has an opportunity to clean up when it is ended by a parent.

## Triggering

Sometimes a child knows better than its parent whether it should be triggered. In this scenario, the child needs to be *created* in `onBegin` but not *started*.

```ts
class Root extends Topic {

    async onBegin() {
        this.setChild(this.createTopicInstance(TravelTopic));

        await this.this.send("How can I help you today?");
    }

    async onTurn() {
        if (await this.dispatchToChild())
            return;

        const result = await this.loadTopicInstance(this.children[0]).trigger();

        if (result && result.score)
            await TravelTopic.beginInstance(this, result.child, result.beginArgs);
    }

    async onChildReturn() {
        await this.this.send(`Welcome back to the Root!`);
        this.clearChildren();
    }
}
Root.register();
```
`Topic` contains a helper called `tryTriggers` that does this for you:
```ts
    async onTurn() {
        if (await this.dispatchToChild())
            return;

        await this.tryTriggers();
    }
```
`tryTriggers` will try every child in `this.children` and start the one returning the highest score, so you can load up a number of potential children and let them duke it out. See this in action in the [triggers](../samples/triggers.ts) sample.

## Prompts

Read up on [prompts](./prompts.md)

## Waterfalls

Read up on [waterfalls](./waterfalls.md)

## Confirmation

TK

## Resolving ambiguity

TK

