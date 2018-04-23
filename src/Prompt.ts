import { Promiseable, Activity, TurnContext } from 'botbuilder';
import { Topic } from "./topical";
import { toPromise, returnsPromiseVoid, Validator, ValidatorResult } from 'botbuilder-topical-common';

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
    Construct = any,
    Context extends TurnContext = TurnContext,
> extends Topic<Args, PromptState<Args>, PromptReturn<V, Args>, Construct, Context> {

    async onBegin (
        args?: Args,
    ) {
         this.state = {
            args,
            turns: 0,
        }

        await this.prompter();
    }

    async onTurn () {

        const result = await this.validator.validate(this.context.activity);

        if (!result.reason)
            return this.returnToParent({
                args: this.state.args,
                result
            });

        if (++ this.state.turns === this.maxTurns) {
            return this.returnToParent({
                args: this.state.args,
                result: {
                    value: result.value,
                    reason: 'too_many_attempts',
                }
            });
        }

        return this.prompter(result);
    }

    maxTurns = Number.MAX_SAFE_INTEGER;
 
    prompter: (result?: ValidatorResult<V>) => Promise<void> = defaultPrompter;

    validator = new Validator<V>(() => {
        throw "no validator provided";
    });
}
