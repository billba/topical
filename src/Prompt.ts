import { Promiseable, Activity, TurnContext } from 'botbuilder';
import { Topic } from "./topical";
import { toPromise, returnsPromiseVoid, Validator, ValidatorResult } from 'botbuilder-topical-common';

export interface PromptInit <PromptArgs> {
    name: string;
    args: PromptArgs;
}

export interface PromptState <PromptArgs> {
    name: string;
    turns: number;
    args: PromptArgs;
}

export interface PromptReturn <V> {
    name: string;
    result: ValidatorResult<V>;
}

export abstract class Prompt <
    V = any,
    PromptArgs = any,
    Construct = any,
    Context extends TurnContext = TurnContext,
> extends Topic<PromptInit<PromptArgs>, PromptState<PromptArgs>, PromptReturn<V>, Construct, Context> {

    async onBegin (
        args: PromptInit<PromptArgs>,
    ) {
         this.state = {
            name: args.name,
            turns: 0,
            args: args.args,
        }

        await this.prompter();
    }

    async onTurn () {

        const result = await this.validator.validate(this.context.activity);

        if (!result.reason)
            return this.returnToParent({
                name: this.state.name,
                result
            });

        if (++ this.state.turns === this.maxTurns) {
            return this.returnToParent({
                name: this.state.name,
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
