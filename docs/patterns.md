# *Topical* patterns

The *Topics* pattern is intentionally very general purpose, enabling a number of different patterns. This page will attempt to document known patterns -- if you find a new one, pleae add it here!

## Single Active Child

This is the simplest and most common pattern. A trigger event causes a child to be started. Subsequent activities are dispatched to the child, which continues until the child topic completes by calling its `this.end()` method with or without a return value. 

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

    async onChildEnd() {
        await this.send(`Welcome back to the Root!`);
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

Sometimes you want a parent to permanently stop dispatching messages to its child.

There are two approaches. You can formally end the child by calling its `end()` method. This gives the child a chance to clean up (via its `onEnd()` method) and will end up calling your `onChildEnd()` method.

If you just want the child to go away completely, you can remove it by calling `this.removeChild(child)` or remove all your children by calling `this.removeChildren()`. The child still has a chance to clean up via its `onRemove()` method.

```ts
    async onDispatch() {
        if (this.text === `cancel`)
            this.removeChildren();

        if (await this.dispatchToChild())
            return;

        if (this.text === "book travel") {
            await this.startChild(TravelTopic);
        }
    }
```

## Scoring

A child topic can contribute data towards the decision of whether its parent should start and/or dispatch to it.

### Start Score

Sometimes a child knows better than its parent whether it should be started. In this scenario, the child needs to be *created* but not *started*:

```ts
    async onStart() {
        this.createChild(TravelTopic);

        await this.send("How can I help you today?");
    }
```

We then *score* each incoming activity until the child topic signals it should be started:

```ts
    async onDispatch() {
        if (await this.dispatchToChild())
            return;

        const startScore = await this.loadChild(Child).getStartScore();

        if (startScore)
            await this.startChild(Child, startScore.startArgs);
    }
```

The result of `getStartScore` is either `void` or a `StartScore` object containing: 
* 0 > `score` <= 1, representing the topic's confidence that the current activity should start it
* `startArgs` that should be supplied to its `start` method in that case.

You can use this data however you see fit. You could compare it do a threshold value:

```ts
        if (startScore && startScore.score > .5)
            await this.startChild(Child, startScore.startArgs);
```

Not all topics have triggers. If not, calling `getStartScore()` will return void.

If you have multiple children, the helper `startBestScoringChild` will try every child and start the one returning the highest score, so you can load up a number of potential children and let them duke it out. For one example of this, see the [triggers](../samples/triggers.ts) sample.

**Pro tip:** Multiple scoring only works if all topics are calibrated. One bad apple can spoil the bunch. 

### Dispatch Score

Similarly, a started topic can also score its confidence that it should be the one to receive an incoming activity. 

The process of calculating a score may overlap with the process of dispatching an activity. For instance, in both cases the same LUIS model may be run. `getDispatchScore` can return the LUIS intent, which can be used by its `onDispatch` method instead of running the same model again.

```ts
    async onDispatch() {
        const dispatchScore = await this.loadChild(Child).getDispatchScore();

        if (dispatchScore)
            await this.dispatchToChild(Child, dispatchScore.dispatchArgs);
    }
```

**Pro tip:** Even more than Start Scoring, Dispatch Scoring is not for the faint of heart. There are many variables to take into account by both the parent and child, and calibration across topics is critical. It is a power tool to be used with all due caution. 

## Prompts

Read up on [prompts](./prompts.md)

## Waterfalls

Read up on [waterfalls](./waterfalls.md)

## Confirmation

TK

For one example of this, see the [dispatch](../samples/dispatch.ts) sample.

## Resolving ambiguity

TK

