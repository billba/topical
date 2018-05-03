import { Prompt, hasText, hasNumber, Culture, Validator, hasChoice, ValidatorResult } from './topical';
import { TurnContext, Activity } from 'botbuilder';
import { FoundChoice, ChoiceFactoryOptions, FindChoicesOptions, Choice, ChoiceFactory } from 'botbuilder-choices';

export class TextPrompt <
    PromptArgs = any,
    Context extends TurnContext = TurnContext,
> extends Prompt<string, PromptArgs, Context> {

    validator = hasText;
}
TextPrompt.register();

export interface CultureConstructor {
    culture: string;
}

export class NumberPrompt <
    PromptArgs = any,
    Context extends TurnContext = TurnContext,
> extends Prompt<number, PromptArgs, Context> {

    constructor(construct: CultureConstructor) {
        super();
        this.validator = hasNumber(construct.culture);
    }
}
NumberPrompt.register();

/**
 * Controls the way that choices for a `ChoicePrompt` or yes/no options for a `ConfirmPrompt` are
 * presented to a user.
 */
export enum ListStyle {
    /** Don't include any choices for prompt. */
    none,

    /** Automatically select the appropriate style for the current channel. */
    auto,

    /** Add choices to prompt as an inline list. */
    inline,

    /** Add choices to prompt as a numbered list. */
    list,

    /** Add choices to prompt as suggested actions. */
    suggestedAction,
}

async function choiceMessageFactory (
    context: TurnContext,
    choices: (string | Choice)[],
    prompt: Activity | string,
    speak?: string,
    options?: ChoiceFactoryOptions,
    style?: ListStyle,
) {
    let msg: Partial<Activity>;

    if (typeof prompt !== 'object') {
        switch (style) {

            case ListStyle.auto:
            default:
                return ChoiceFactory.forChannel(context, choices, prompt, speak, options);
            
            case ListStyle.inline:
                return ChoiceFactory.inline(choices, prompt, speak, options);

            case ListStyle.list:
                return ChoiceFactory.list(choices, prompt, speak, options);

            case ListStyle.suggestedAction:
                return ChoiceFactory.suggestedAction(choices, prompt, speak);

            case ListStyle.none:
                msg = {
                    type: 'message',
                    text: prompt
                };
                break;
            }
    } else {
        msg = { ... prompt }
    }

    if (speak)
        msg.speak = speak;
    
    return msg;
}

export interface ChoicePromptArgs {
    prompt: string | Activity;
    reprompt?: string | Activity;
    speak?: string;
    style?: ListStyle; 
    options?: ChoiceFactoryOptions; 
    name?: string;
}

async function choicePrompter (
    this: ChoicePrompt,
    result?: ValidatorResult<FoundChoice>,
) {
    await this.send(await choiceMessageFactory(
        this.context,
        this.choices,
        result && this.state.args!.reprompt
            ? this.state.args!.reprompt!
            : this.state.args!.prompt,
        this.state.args!.speak,
        this.state.args!.options,
        this.state.args!.style
    ));
}

export interface ChoiceConstructor {
    choices: (string | Choice)[];
    options?: FindChoicesOptions;
}

export class ChoicePrompt <
    Context extends TurnContext = TurnContext,
> extends Prompt<FoundChoice, ChoicePromptArgs, Context> {
    choices: (string | Choice)[];

    constructor(construct: ChoiceConstructor) {
        super();
        this.choices = construct.choices;
        this.validator = hasChoice(construct.choices, construct.options);
        this.prompter = choicePrompter;
    }
}
ChoicePrompt.register();