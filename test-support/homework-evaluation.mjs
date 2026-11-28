/** Heldout synthetic tasks: never import this material into a shared AI prompt.
 * Regex checks are a bounded smoke screen, not proof of correctness or learning.
 * Review the explanation, assumptions and answer against manualReview as well.
 */
const freezeCase = value => Object.freeze({...value,
  expected:Object.freeze({...value.expected}),
  checks:Object.freeze(value.checks.map(check=>Object.freeze({...check,anyOf:Object.freeze([...check.anyOf])}))),
  manualReview:Object.freeze([...value.manualReview])
});

export const HOMEWORK_EVALUATION_CASES = Object.freeze([
  freezeCase({
    id:'algebra-heldout',title:'A different linear equation',
    prompt:'Solve 4(2x + 1) - 3 = 5x + 16. Show the main solution steps and check your answer in the original equation.',
    studentNotes:'I want to understand how to distribute before collecting the x terms, then verify the result.',
    expected:{solution:5,checkedSide:41},
    checks:[
      {id:'answer',label:'Identifies x = 5',anyOf:['\\bx\\s*(?:=|is|equals|:)\\s*(?:\\*\\*)?5(?:\\.0+)?(?!\\d|\\.\\d)']},
      {id:'check',label:'Includes the substitution value 41',anyOf:['(?<![\\d.])41(?:\\.0+)?(?!\\d|\\.\\d)']}
    ],
    manualReview:[
      'Distribution produces 8x + 1 = 5x + 16; collecting terms yields 3x = 15 and x = 5.',
      'The check substitutes 5 in both ORIGINAL sides and obtains 41, rather than merely repeating the answer.',
      'The response addresses this equation, not the demonstration equation or an unrelated worked example.'
    ]
  }),
  freezeCase({
    id:'dilution-heldout',title:'Concentration with added water',
    prompt:'A 750 mL bottle contains 12% concentrate by volume. How many millilitres of concentrate are in it? If 250 mL of water is added without losing any mixture, what is the new concentrate percentage? Assume the volumes add.',
    studentNotes:'I think the amount of concentrate stays the same, while the total volume changes.',
    expected:{concentrateMl:90,newTotalMl:1000,newPercent:9},
    checks:[
      {id:'amount',label:'Finds 90 mL of concentrate',anyOf:['(?<![\\d.])90(?:\\.0+)?\\s*(?:m[lL]|millilit(?:er|re)s?)\\b','\\b(?:concentrate|concentrated)[^\\n]{0,70}(?<![\\d.])90(?:\\.0+)?(?!\\d|\\.\\d)']},
      {id:'percentage',label:'Finds the new concentration of 9%',anyOf:['(?<![\\d.])9(?:\\.0+)?\\s*(?:%|percent|per cent)']}
    ],
    manualReview:[
      'Uses 0.12 × 750 = 90 mL, not 12 mL or 12 × 750.',
      'Keeps 90 mL of concentrate and divides by the NEW total of 1,000 mL to obtain 9%.',
      'Names the additive-volume/no-loss assumptions and does not confuse added water with added concentrate.'
    ]
  }),
  freezeCase({
    id:'probability-heldout',title:'Either order without replacement',
    prompt:'A bag contains four red and six blue counters. Two counters are drawn without replacement. What is the probability of getting one red and one blue, in either order? Give an exact fraction and explain the calculation.',
    studentNotes:'I want to know whether I need to count red-then-blue and blue-then-red separately.',
    expected:{numerator:8,denominator:15,orderedFavorable:48,orderedTotal:90},
    checks:[
      {id:'fraction',label:'Gives the exact fraction 8/15',anyOf:['(?<![\\d.])8\\s*/\\s*15(?!\\d|\\.\\d)','\\\\(?:d?frac)\\s*\\{\\s*8\\s*\\}\\s*\\{\\s*15\\s*\\}']},
      {id:'orders',label:'Accounts for both orders',anyOf:['\\bboth\\b','\\btwo orders\\b','\\beither order\\b','\\b48\\s*/\\s*90\\b','\\b24\\s*/\\s*90[^\\n]{0,40}\\+']}
    ],
    manualReview:[
      'Adds (4/10 × 6/9) and (6/10 × 4/9), or equivalently counts 48 favorable ordered pairs out of 90.',
      'Does not return only 4/15, assume replacement, or treat the draws as independent.',
      'Explains why the second denominator is nine and why the two orders are disjoint.'
    ]
  })
]);

export const HOMEWORK_CACHE_PROBE_CASES = Object.freeze([
  freezeCase({
    id:'break-even-cache-probe',title:'A different break-even quantity',
    prompt:'An item sells for $45 and has variable cost of $27 per unit. Fixed costs are $2,700. What whole-unit sales volume breaks even? Check the profit at that volume and at one fewer unit. Assume constant prices and costs.',
    studentNotes:'Please distinguish selling price from the amount available to cover fixed costs.',
    expected:{contribution:18,minimumUnits:150,minimumProfit:0,previousProfit:-18},
    checks:[
      {id:'margin',label:'Finds an $18 contribution per unit',anyOf:['(?<![\\d.])18(?:\\.0+)?(?!\\d|\\.\\d)']},
      {id:'quantity',label:'Finds 150 units',anyOf:['(?<![\\d.])150(?!\\d|\\.\\d)']},
      {id:'boundary',label:'Checks 149 units and its loss',anyOf:['(?<![\\d.])149(?!\\d|\\.\\d)']}
    ],
    manualReview:[
      'Subtracts 27 from 45 to obtain the $18 contribution and computes 2,700 / 18 = 150 units.',
      'Checks profit of zero at 150 units and a loss of $18 at 149; numbers alone are not sufficient.',
      'Keeps the constant-cost assumption and does not reuse the demonstration result of 116 units.'
    ]
  }),
  freezeCase({
    id:'discount-tax-cache-probe',title:'Discount before sales tax',
    prompt:'An $80 calculator is discounted by 25%. Sales tax of 8% is charged on the discounted price. What is the total price? Show the calculation and a short check.',
    studentNotes:'I am unsure whether to calculate tax from the original price or the discounted price.',
    expected:{discountedPrice:60,tax:4.8,total:64.8},
    checks:[
      {id:'discount',label:'Finds a $60 discounted price',anyOf:['(?<![\\d.])60(?:\\.0+)?(?!\\d|\\.\\d)']},
      {id:'total',label:'Finds a $64.80 total',anyOf:['(?<![\\d.])64\\.80?(?!\\d|\\.\\d)']}
    ],
    manualReview:[
      'Computes 80 × 0.75 = 60, then tax of 60 × 0.08 = 4.80 and total of 64.80.',
      'Uses the discounted tax base and does not add or subtract the percentages directly.',
      'Provides a reverse or equivalent check; a correct-looking number without a relevant explanation needs review.'
    ]
  })
]);

export const HOMEWORK_EVALUATION_LIMITS = Object.freeze({
  maxContentCharacters:100000,
  automaticChecksAreConclusive:false,
  manualReviewRequired:true,
  scope:'Synthetic homework correctness and relevance; not a grade, source-verification or student-learning certification.'
});
