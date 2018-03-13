import { Activity } from 'botbuilder';
import { Validator } from './Validator';

export const isMessage = new Validator<Partial<Activity>>(activity => activity.type === 'message'
    ? {
        value: activity
    }
    : {
        reason: 'not_a_message'
    }
);

export const hasText = isMessage
    .and<string>((activity, value) => {
        const text = value.text.trim();

        return text.length
            ? {
                value: text
            }
            : {
                reason: 'empty_text'
            }
    });

import { Culture } from '@microsoft/recognizers-text-suite';
export { Culture }

import { NumberRecognizer } from '@microsoft/recognizers-text-number';

export const hasNumbers = (culture: Culture) => hasText
    .and<number[]>(async (activity, text) => {
        const numbers = new NumberRecognizer(culture)
            .getNumberModel()
            .parse(text)
            .map(modelResult => modelResult.resolution)
            .filter(resolution => resolution !== undefined)
            .map(resolution => parseFloat(resolution.value));

        return numbers.length > 0
            ? { value: numbers }
            : { reason: 'not_a_number' }
    });

export const hasNumber = (culture: Culture) => hasNumbers(culture)
    .and<number>(async (activity, numbers) => ({ value: numbers[0] }));
