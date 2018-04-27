import { MemoryStorage, ConsoleAdapter } from 'botbuilder';
import { Topic, prettyConsole, Waterfall, ValidatorResult, CultureConstructor, Prompt, hasNumber, hasText, consoleOnTurn, doTopic, PromptArgs, NumberPrompt, TextPrompt } from '../src/topical';

class PromptForName extends TextPrompt {

    validator = hasText
        .and((activity, text) => text.length > 1 && text.length < 30 || 'invalid_name');
}
PromptForName.register();

class PromptForAge extends NumberPrompt {

    constructor(construct: CultureConstructor) {
        super(construct);

        this.validator = hasNumber(construct.culture)
            .and((activity, num) => num > 0 && num < 150 || 'invalid_age');
    }
}
PromptForAge.register();

class Age extends Waterfall {

    waterfall(next: (arg?: any) => void) {
        return [
            async () => {
                await this.startChild(PromptForName, {
                    prompt: `What's your name?`,    
                    reprompt: `Please tell me your name`,
                });
            },

            async (name: string) => {
                await this.send(`Nice to meet you, ${this.text}!`);
                if (name === 'Bill Barnes')
                    next(51);
                else
                    await this.startChild(PromptForAge, {
                        prompt: `How old are you?`,
                        reprompt: `Please tell me your age.`,   
                    }, { culture: 'en-us' }
                );
            },

            async (age: number) => {
                await this.send(age > 30
                    ? `You're ${age}? That's so old!`
                    : `Phew, you've still got a few good years left`
                );
            },
        ];
    }

    // uses default onStart, onTurn, onChildReturn
}
Age.register();

class Root extends Topic {

    async onStart() {
        await this.startChild(Age);
    }

    // uses default onTurn, onChildReturn
}
Root.register();

// const wst = new WSTelemetry('ws://localhost:8080/server');
// Topic.telemetry = action => wst.send(action);

Topic.init(new MemoryStorage());

consoleOnTurn(
    new ConsoleAdapter()
        .use(prettyConsole),
    context => doTopic(Root, context)
);