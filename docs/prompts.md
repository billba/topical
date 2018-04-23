# Prompting

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
    .transform((activity, num) => ({ min: 0, max: num}));
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

Using the Validator pattern, you can build (or import) a library of validators that can be used and reused. *Topical* comes with a small number of validators for your convenience, including `hasText` and `hasNumber`.

Note that validators can be used independently of the rest of *Topical*. Enjoy!

## Prompts

You can imagine a Topic that runs user input through a specific validator, using the results of that validator to guide the user to a valid response, and returning that response. That's what a *prompt* is. You specify:

* a `validator`
* a `prompter` method which provides the initial prompt to the user, and uses the result of the validator to guide them towards a valid response. `Prompt` provides a default prompter.
* `maxTurns` -- a maximum number of turns (tries). This defaults to `Number.MAX_SAFE_INTEGER`.

When you invoke a prompt you optionally supply arguments. These are made available to the `prompter` as `this.state.args`.

When the prompt completes, it returns the following to the parent Topic's `onChildReturn` method as `child.return`:

* `args`: the (optional) arguments supplied when you invoked the prompt
* `result`: if successful, the result of the last call to the validator. If unsuccessful (the user exceeded `maxTurns`), { reason: 'too_many_attempts' }

The default prompter expects the following arguments:

* `name`: optional: the name of the prompt. This allows the same prompt to be used to capture multiple fields.
* `prompt`: required: a string to use as the initial prompt to the user
* `reprompt`:  optional: a string to use for subsequent guidance for the user. If absent, `prompt` will be used.

You can supply your own prompter which may or may not use different arguments to yield different behaviors. For example, you may wish to provide fine-grained guidance to the user based on the reason code returned by the validator.

### Built-in Prompts

*Topical* comes with prompts `TextPrompt` and `NumberPrompt` which specify validators `hasText` and `hasNumber`, respectively, and use the defaults for `maxTurns` and `prompter`:
```ts
class MyTopic extends Topic {

    async onBegin() {
        this.beginChild(TextPrompt, {
            prompt: `What's your name?`
        });
    }

    async onChildReturn(child) {
        await this.context.sendActivity(`Nice to meet you, ${child.return.result.value}`);
    }
}
MyTopic.subtopics = [TextPrompt];
```

### Reusing Prompts

Let's say you want to prompt for your cat's name and your dog's name using a hypothetical `hasPetName` validator. You don't need to create two prompts. You can reuse one by taking advantage of the optional `name` arguments field:
```ts
class PetNamePrompt extends Prompt {

    validator = hasPetName;
}

class MyTopic extends Topic {

    async onBegin() {
        await this.beginChild(PetNamePrompt, {
            name: 'dog', 
            prompt: `What is your dog's name?`
        });
    }

    async onTurn() {
        await this.dispatchToChild();
    }

    async onChildReturn(child) {
        if (child.return.args.name === 'dog') {
            this.state.dogName = child.return.result.value;
            await this.beginChild(PetNamePrompt, {
                name: 'cat',
                prompt: `What is your cat's name?`
            });
        } else {
            this.state.catName = child.return.result.value;
            this.clearChildren();
        }
    }
}
MyTopic.subtopics = [PromptForPetName];
```

Again, you can pass any arguments you want to your prompt. Having a `name` field is just a convention used by the default `prompter`.

### Custom prompts

To create a custom prompt, change one or more of:
* `maxTurns`
* `validator`
* `prompter`

The following custom prompt uses our custom `isBigNumber` validator from the `Validator` section above, along with a limited number of turns and a custom prompter.
```ts
class BigNumberPrompt extends Prompt {

    validator = isBigNumber;

    maxTurns = 5;

    prompter = result => {
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
        await this.beginChild(BigNumberPrompt);
    }

    async onTurn() {
        await this.dispatchToChild();
    }

    async onChildReturn(child) {
        if (child instanceof BigNumberPrompt) {
            if (!child.return.result.reason)
                await context.sendActivity(`${child.return.result.value} is indeed a big number.`);
            else
                await context.sendActivity(`Sorry it didn't work out.`);
        }
    }
}
MyTopic.subtopics = [BigNumberPrompt];
```
Note that this prompt doesn't require any arguments at all. 

