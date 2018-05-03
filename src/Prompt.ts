import { Promiseable, Activity, TurnContext } from 'botbuilder';
import { Topic, toPromise, returnsPromiseVoid, Validator, ValidatorResult } from "./topical";

export interface PromptArgs {
    name?: string;
    prompt: string | Activity;
    reprompt?: string | Activity;
}

async function defaultPrompter (
    this: Prompt<any, PromptArgs>,
    result?: ValidatorResult<any>,
) {
    await this.send(result && this.state.args!.reprompt
        ? this.state.args!.reprompt!
        : this.state.args!.prompt
    );
}

export interface PromptState <Args> {
    turns: number;
    args?: Args;
}

export interface PromptReturn <V, Args> {
    args?: Args;
    result: ValidatorResult<V>;
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
            this.prompter(result);
    }

    maxTurns = Number.MAX_SAFE_INTEGER;
 
    prompter: (result?: ValidatorResult<V>) => Promise<void> = defaultPrompter;

    validator = new Validator<V>(() => {
        throw "no validator provided";
    });
}
