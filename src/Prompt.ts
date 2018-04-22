import { Promiseable, Activity, TurnContext } from 'botbuilder';
import { Topic } from "./topical";
import { toPromise, returnsPromiseVoid, Validator, ValidatorResult } from 'botbuilder-topical-common';

export interface PromptState <PromptArgs> {
    turns: number;
    args?: PromptArgs;
}

export interface PromptReturn <V, PromptArgs> {
    args?: PromptArgs;
    result: ValidatorResult<V>;
}

export abstract class Prompt <
    V = any,
    PromptArgs = any,
    Construct = any,
    Context extends TurnContext = TurnContext,
> extends Topic<PromptArgs, PromptState<PromptArgs>, PromptReturn<V, PromptArgs>, Construct, Context> {

    async onBegin (
        args?: PromptArgs,
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

    maxTurns = 3;
 
    abstract async prompter (result?: ValidatorResult<V>): Promise<void>;

    validator = new Validator<V>(() => {
        throw "no validator provided";
    });
}
