import { Prompt, hasText, hasNumber, Culture, Validator, hasChoice, ValidatorResult, PromptArgs } from './topical';
import { TurnContext, Activity, InputHints } from 'botbuilder';
import { FoundChoice, ChoiceFactoryOptions, FindChoicesOptions, Choice, ChoiceFactory } from 'botbuilder-choices';

export class TextPrompt <
    Args = PromptArgs,
    Context extends TurnContext = TurnContext,
> extends Prompt<string, Args, Context> {

    validator = hasText;
}
TextPrompt.register();

export class NumberPrompt <
    Args = PromptArgs,
    Context extends TurnContext = TurnContext,
> extends Prompt<number, Args, Context> {

    constructor(culture: string) {
        super();
        this.validator = hasNumber(culture);
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
                msg = ChoiceFactory.forChannel(context, choices, prompt, speak, options);
                break;
            
            case ListStyle.inline:
                msg = ChoiceFactory.inline(choices, prompt, speak, options);
                break;

            case ListStyle.list:
                msg = ChoiceFactory.list(choices, prompt, speak, options);
                break;

            case ListStyle.suggestedAction:
                msg = ChoiceFactory.suggestedAction(choices, prompt, speak);
                break;

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
    
    msg.inputHint = InputHints.ExpectingInput;

    return msg;
}

export interface ChoicePromptArgs extends PromptArgs {
    style?: ListStyle; 
    options?: ChoiceFactoryOptions; 
}

async function choicePrompter (
    this: ChoicePrompt,
    result?: ValidatorResult<FoundChoice>,
) {
    await this.send(await choiceMessageFactory(
        this.context,
        this.choices,
        result && this.state.args!.reprompt || this.state.args!.prompt,
        result && this.state.args!.speakReprompt || this.state.args!.speakPrompt,
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