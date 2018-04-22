# Prompts

A common part of a conversation is asking a question and waiting for an answer that matches certain criteria. For instance, "How old are you?" requires a number within a certain range, and "when do you want to fly to Paris" requires a date in the future.

*Topical* providers two types of helpers for this: *Validators* and *Prompts*.

## Validators

A Validator *recognizes* certain types of data in user input. For example, the following validator recognizes if the user's input is a number:
```ts
const isNumber = new Validator(activity => {
    if (activity.type === 'message') {
        const num = Number.parseInt(activity.text);
        if (!isNaN(num))
            return num;
    }
})
```
You use it like this:
```ts
const result = isNumber.validate(activity);
if (result.value) {
    ...
}
```
You can create a new Validator by applying constraints to an existing one:
```ts
const isBigNumber = isNumber
    .and((activity, num) => num > 1000);
```
You can also create a new Validator by transforming the result of an existing one:
```ts
const getRange = isNumber
    .transform((activity, num) => { min: 0, max: num});
```
One of the useful things about *Topical* validators is that you can provide a *reason* why something doesn't validate:
```ts
const isBigNumber = isNumber
    .and((activity, num) => num > 1000 || 'too_small');
```
Now you can use that reason to guide the user:
```ts
const result = isBigNumber.validate(context.activity);
switch (result.reason) {
    case 'too_small':
        await context.sendActivity(`That's too small`);
        break;
    case 'NaN':
        await context.sendActicity(`Not a number`);
        break;
    case undefined:
        await context.sendActivity(`Perfect! You said ${result.value}`);
        break;
}
```
The reason is being generated in one piece of code, and used in another. Isn't that a lot of unnecessasry overhead?

For one-off situations, absolutely. But in general it's an anti-pattern to bind together validation logic and action logic, because it means you can't reuse the validation logic. Also, imagine building up validators by adding constraints as shown above -- the action logic would be spread across a whole chain of validators, instead of in one place.

Using the Validator pattern, you can build (or import) a library of validators that can be used and reused. *Topical* comes with a small number of validators for your convenience.

Note that validators can be used independently of the rest of *Topical*. Enjoy!

## Prompts

With Validators in hand, you can imagine a Topic that runs user input through a specific validator, using the results of that Validator to guide the user to a valid response. That's what *Prompts* are. To use them:

* you create a subclass of the abstract class `Prompt`
* ... specifying a validator
* ... and a `prompter` method which provides the initial prompt to the user, and guides them towards a valid response
* ... and (optionally) a maximum number of tries before giving up. If the user exceeds this number, a reason code of 'too_many_attempts' is returned.
* then your topic calls `this.beginChild(YourPrompt)` (optionally passing in arguments to your prompt)
* in your topic's `onChildReturn` function, the result of the prompt is in `child.return.result`

### Prompts in action

```ts
class PromptForBigNumber extends Prompt {

    validator = isBigNumber;
    maxTurns = 5;

    async prompter(result) {
        if (!result) {
            await this.context.sendActivity(`Please tell me a big number.`);
            return;
        }

        switch (result.reason) {
            case 'too_small':
                await context.sendActivity(`That's too small`);
                break;
            case 'NaN':
                await context.sendActivity(`Not a number`);
                break;
        }
    }
}

class MyTopic extends Topic {
    async onBegin() {
        await this.beginChild(PromptForBigNumber);
    }

    async onTurn() {
        await this.dispatchToChild();
    }

    async onChildReturn(child) {
        if (child instanceof PromptForBigNumber) {
            await context.sendActivity(`Perfect! You said ${child.return.result.value}`);
        }
    }
}
MyTopic.subtopics = [PromptForBigNumber];
```
### Built-in Prompts
```
*Topical* comes with validators `hasText` and `hasNumber` which are used in abstract prompts`TextPrompt` and `NumberPrompt` -- you just add your own prompter and go, e.g.
```ts
class PromptForText extends TextPrompt {

    async prompter(result) {
        await this.context.sendActivity(`Please provide some text`)
    }
}
```
This is just a convenient shorthand for:
```ts
class PromptForText extends Prompt {

    validator = hasText;

    async prompter(result) {
        await this.context.sendActivity(`Please provide some text`)
    }
}
```
### Constraining prompts
What if you want a more specific text prompt, e.g. require longer text? You may be tempted to inherit from `TextPrompt`. This is incorrect. **The inheritance path for prompts is not via the prompt *classes*, but via the *validators*.**
```ts
class PromptForText extends Prompt {

    validator = hasText
        .and((activity, text) => text.length > 10 | 'too_short');

    async prompter(result) {
        await this.context.sendActivity(result
            ? `Please provide some text`
            : `You'll have to give me more than that`
        );
    }
}
```
### Reusing Prompts
Let's say you want to prompt for your cat's name and your dog's name using a hypothetical `hasPetName` validator. You don't need to create two prompts. You can reuse one:
```ts
class PromptForName extends Prompt {

    validator = hasPetName;

    async prompter(result) {
        await this.context.sendActivity(result
            ? this.state.args.prompt
            : `Please provide a valid name`
        );
    }
}

class MyTopic extends Topic {

    async onBegin() {
        await this.beginChild(PromptForPetName, {
            name: 'dog',
            prompt: `What is your dog's name?`
        });
    }

    async onTurn() {
        await this.dispatchToChild();
    }

    async onChildReturn(child) {
        if (child instanceof PromptForPetName) {
            if (child.return.args.name === 'dog') {
                this.state.dogName = child.return.result.value;
                await this.beginChild(PromptForPetName, {
                    name: 'cat',
                    prompt: `What is your cat's name?`
                });
            } else {
                this.state.catName = child.return.result.value;
                this.clearChildren();
            }
        }
    }
}
MyTopic.subtopics = [PromptForPetName];
```
You can use put whatever you want in the second argument to `this.beginChild` -- here it is being used to disambiguate the specific prompt, and specify the initial prompt, but it can be any value. It is made available to `prompter` as `this.state.args` and is returned back to the parent as `child.return.args`.
