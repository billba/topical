import { Promiseable, Activity, TurnContext, InputHints } from 'botbuilder';
import { Topic, toPromise, returnsPromiseVoid, Validator, ValidatorResult } from "./topical";

export interface PromptArgs {
    name?: string;
    prompt: string | Activity;
    speakPrompt?: string;
    reprompt?: string | Activity;
    speakReprompt?: string;
}

export interface PromptState <Args> {
    turns: number;
    args?: Args;
}

export interface PromptReturn <V, Args> {
    args?: Args;
    result: ValidatorResult<V>;
}


async function defaultPrompter (
    this: Prompt<any, PromptArgs>,
    result?: ValidatorResult<any>,
) {
    await this.send(
        result && this.state.args!.reprompt || this.state.args!.prompt,
        result && this.state.args!.speakReprompt || this.state.args!.speakPrompt,
        InputHints.ExpectingInput,
    );
}

export abstract class Prompt <
    V = any,
    Args = PromptArgs,
    Context extends TurnContext = TurnContext,
> extends Topic<Args, PromptState<Args>, PromptReturn<V, Args>, Context> {

    async onStart (
        args?: Args,
    ) {
         this.state = {
            args,
            turns: 0,
        }

        await this.prompter();
    }

    async onDispatch () {

        if (!this.validator)
            throw `Prompt ${this.constructor.name} has no validator.`;

        const result = await this.validator.validate(this.context.activity);

        if (!result.reason)
            await this.end({
                args: this.state.args,
                result
            });
        else if (++ this.state.turns === this.maxTurns)
            await this.end({
                args: this.state.args,
                result: {
                    value: result.value,
                    reason: 'too_many_attempts',
                }
            });
        else
            await this.prompter(result);
    }

    maxTurns = Number.MAX_SAFE_INTEGER;
 
    prompter: (result?: ValidatorResult<V>) => Promise<void> = defaultPrompter;

    validator?: Validator<V>;
}
