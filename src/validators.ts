import { Activity } from 'botbuilder';
import { Validator, ValidatorResult } from './Validator';

export const isMessage = new Validator<Partial<Activity>>(activity => activity.type === 'message'
    ? activity
    : { reason: 'not_a_message' }
);

export const hasText = isMessage
    .transform<string>((activity, value) => {

        const text = value.text!.trim();

        return text.length
            ? text
            : { reason: 'empty_text' };
    });

import { NumberRecognizer } from '@microsoft/recognizers-text-number';

export const hasNumbers = (culture: string) => hasText
    .transform<number[]>(async (activity, text) => {

        const numbers = new NumberRecognizer(culture)
            .getNumberModel()
            .parse(text)
            .map(modelResult => modelResult.resolution)
            .filter(resolution => resolution !== undefined)
            .map(resolution => parseFloat(resolution.value));

        return numbers.length > 0
            ? numbers
            : { reason: 'not_a_number' };
    });

export const hasNumber = (culture: string) => hasNumbers(culture)
    .transform<number>(async (activity, numbers) => numbers[0] );

export { Culture } from '@microsoft/recognizers-text-number';
