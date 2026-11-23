/* Pure comparison arithmetic. A policy limit is not a school-approved degree audit. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DegreeCostComparison = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TYPES = new Set(['per-credit', 'banded-term', 'threshold-credit', 'paid-term']);
  const INPUT_KEYS = new Set(['transferUnits', 'outsideBudget', 'unitsPerTerm', 'beforeTerms', 'afterTerms']);
  const own = (value, name) => Object.prototype.hasOwnProperty.call(value, name);
  const object = (value, label) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(label + ' must be an object.');
    return value;
  };
  // Inputs arrive from number fields as text. Accept decimal notation only;
  // missing, empty, hexadecimal, nonfinite and boolean values are never zero.
  function amount(value, label, {min = 0, max = 1000000, integer = false} = {}) {
    if (typeof value === 'string') {
      value = value.trim();
      if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)) throw new TypeError('Enter a valid ' + label + '.');
      value = Number(value);
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || integer && !Number.isInteger(value)) {
      throw new RangeError('Enter a valid ' + label + ' between ' + min + ' and ' + max + (integer ? ' using whole numbers.' : '.'));
    }
    return value;
  }
  const cents = value => Math.round((value + Number.EPSILON) * 100) / 100;
  function currency(value, label, options = {}) {
    const result = amount(value, label, options);
    if (Math.abs(result * 100 - Math.round(result * 100)) > 0.000001) throw new RangeError('Enter ' + label + ' with no more than two decimal places.');
    return cents(result);
  }
  const positiveRate = (value, label) => currency(value, label, {min:0.01, max:1000000});
  const from = (input, key, fallback) => own(input, key) ? input[key] : fallback;
  function normalize(entry, input) {
    object(entry, 'Comparison entry'); object(input, 'Comparison inputs');
    if (Object.keys(input).some(name => !INPUT_KEYS.has(name))) throw new TypeError('Comparison inputs contain an unsupported field.');
    const model = object(entry.model, 'Tuition model'), pace = entry.pace === undefined ? {} : object(entry.pace, 'Study pace');
    if (!TYPES.has(model.type)) throw new TypeError('Choose a supported tuition model.');
    const totalUnits = amount(entry.totalUnits, 'program units', {min:1, max:1000, integer:true});
    const limit = amount(entry.scenarioTransferLimit, 'comparison transfer limit', {max:totalUnits, integer:true});
    const defaultTransfer = entry.defaultTransferUnits === undefined ? limit : entry.defaultTransferUnits;
    // Quarter-hour programs (for example 4.5-credit courses) apply transfer credit in quarter-unit steps; every other model stays whole-unit.
    const unitStep = entry.unitStep === 0.25 || entry.unitStep === 0.5 ? entry.unitStep : null;
    const transferUnits = amount(from(input, 'transferUnits', defaultTransfer), 'applied transfer units', {max:limit, integer:!unitStep});
    if (unitStep && Math.abs(transferUnits / unitStep - Math.round(transferUnits / unitStep)) > 1e-9) throw new RangeError('Enter a valid applied transfer units between 0 and ' + limit + ' in steps of ' + unitStep + '.');
    const enteredBudget = currency(from(input, 'outsideBudget', entry.defaultOutsideBudget === undefined ? 2000 : entry.defaultOutsideBudget), 'outside-credit budget', {max:100000});
    const outsideBudget = transferUnits === 0 ? 0 : cents(enteredBudget);
    let unitsPerTerm = null;
    if (model.type !== 'paid-term') {
      const min = amount(pace.min === undefined ? 1 : pace.min, 'minimum term load', {min:1, max:1000, integer:true});
      const max = amount(pace.max === undefined ? (model.bandMax === undefined ? totalUnits : model.bandMax) : pace.max, 'maximum term load', {min, max:1000, integer:true});
      unitsPerTerm = amount(from(input, 'unitsPerTerm', pace.defaultUnits), 'units per term', {min, max, integer:true});
    } else if (own(input, 'unitsPerTerm')) {
      throw new TypeError('Paid-term comparisons use explicit paid terms instead of a per-term credit estimate.');
    }
    return {model, pace, totalUnits, transferUnits, remainingUnits:totalUnits - transferUnits, outsideBudget, enteredBudget, unitsPerTerm};
  }
  function termLoads(units, pace) {
    const result = [];
    while (units > 0) {const load = Math.min(units, pace); result.push(load); units -= load;}
    return result;
  }
  function tuitionFor(model, loads) {
    if (model.type === 'per-credit') {
      const rate = positiveRate(model.rate, 'tuition per unit');
      return cents(loads.reduce((sum, units) => sum + units * rate, 0));
    }
    if (model.type === 'banded-term') {
      const rate = positiveRate(model.termRate, 'flat tuition per term');
      const partTime = positiveRate(model.partTimeRate, 'part-time tuition per unit');
      const min = amount(model.bandMin, 'flat-rate minimum load', {min:1, max:1000, integer:true});
      const max = amount(model.bandMax, 'flat-rate maximum load', {min, max:1000, integer:true});
      if (loads.some(units => units > max)) throw new RangeError('The term load exceeds the published flat-rate band.');
      return cents(loads.reduce((sum, units) => sum + (units >= min ? rate : units * partTime), 0));
    }
    if (model.type === 'threshold-credit') {
      const full = positiveRate(model.fullTimeRate, 'full-time tuition per unit');
      const part = positiveRate(model.partTimeRate, 'part-time tuition per unit');
      const threshold = amount(model.fullTimeMin, 'full-time minimum load', {min:1, max:1000, integer:true});
      return cents(loads.reduce((sum, units) => sum + units * (units >= threshold ? full : part), 0));
    }
    throw new TypeError('Use the paid-term calculation for this tuition model.');
  }
  function calculate(entry, input = {}) {
    const value = normalize(entry, input), {model, pace, totalUnits, transferUnits, remainingUnits, outsideBudget, unitsPerTerm} = value;
    let beforeTuition, afterTuition, beforeTerms, afterTerms, beforeLoads = null, afterLoads = null;
    let zeroTransferTermReset = false;
    if (model.type === 'paid-term') {
      const rate = positiveRate(model.termRate, 'tuition per paid term');
      beforeTerms = amount(from(input, 'beforeTerms', model.defaultBeforeTerms), 'paid terms without transfer', {min:1, max:40, integer:true});
      const requestedAfter = amount(from(input, 'afterTerms', model.defaultAfterTerms), 'paid terms after transfer', {min:1, max:40, integer:true});
      // With no outside credit this is the same no-transfer scenario. Do not
      // quietly turn an unrelated change in pace into transfer-credit savings.
      afterTerms = transferUnits === 0 ? beforeTerms : requestedAfter;
      zeroTransferTermReset = transferUnits === 0 && requestedAfter !== beforeTerms;
      beforeTuition = cents(beforeTerms * rate);
      afterTuition = cents(afterTerms * rate);
    } else {
      if (own(input, 'beforeTerms') || own(input, 'afterTerms')) throw new TypeError('This comparison calculates billed terms from the stated credit load.');
      beforeLoads = termLoads(totalUnits, unitsPerTerm); afterLoads = termLoads(remainingUnits, unitsPerTerm);
      beforeTerms = beforeLoads.length; afterTerms = afterLoads.length;
      beforeTuition = tuitionFor(model, beforeLoads); afterTuition = tuitionFor(model, afterLoads);
    }
    const beforeTotal = beforeTuition, afterTotal = cents(afterTuition + outsideBudget), savings = cents(beforeTotal - afterTotal);
    const universityTermsAvoided = beforeTerms - afterTerms;
    const termWeeks = pace.teachingWeeks === undefined ? (pace.termWeeks === undefined ? (model.termWeeks === undefined ? entry.termWeeks : model.termWeeks) : pace.termWeeks) : pace.teachingWeeks;
    let teachingWeeks;
    if (termWeeks !== undefined && termWeeks !== null) {
      const weeks = amount(termWeeks, 'teaching weeks per term', {min:0.1, max:104});
      teachingWeeks = {before:cents(beforeTerms * weeks), after:cents(afterTerms * weeks), avoided:cents(universityTermsAvoided * weeks)};
    }
    return {
      entryId:entry.id || null, schoolId:entry.schoolId || null, modelType:model.type,
      scope:'university-tuition-plus-outside-budget',
      beforeTuition, afterTuition, outsideBudget,
      beforeTotal, afterTotal, savings,
      savingsPercent:cents(savings / beforeTotal * 100),
      transferUnits, remainingUnits, totalUnits, unitsPerTerm,
      beforeTerms, afterTerms, universityTermsAvoided,
      termLabel:pace.termLabel || entry.termLabel || 'term',
      beforeLoads, afterLoads, zeroTransferTermReset,
      ...(teachingWeeks ? {teachingWeeks, beforeTeachingWeeks:teachingWeeks.before, afterTeachingWeeks:teachingWeeks.after, teachingWeeksAvoided:teachingWeeks.avoided} : {}),
      input:{transferUnits, outsideBudget, ...(model.type === 'paid-term' ? {beforeTerms,afterTerms} : {unitsPerTerm})}
    };
  }
  function compare(data, input = {}) {
    const entries = Array.isArray(data) ? data : object(data, 'Comparison data').entries;
    if (!Array.isArray(entries)) throw new TypeError('Comparison data needs an entries array.');
    object(input, 'Comparison inputs');
    if (Object.keys(input).some(name => name !== 'outsideBudget')) throw new TypeError('A shared comparison accepts an outside budget only; each school keeps its own credit and term assumptions.');
    const budget = own(input, 'outsideBudget') ? input.outsideBudget : (!Array.isArray(data) && data.defaultOutsideBudget !== undefined ? data.defaultOutsideBudget : 2000);
    return entries.map(entry => calculate(entry, {outsideBudget:budget}));
  }
  function money(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError('Money must be a finite number.');
    return new Intl.NumberFormat('en-US', {style:'currency', currency:'USD', maximumFractionDigits:0}).format(value);
  }
  return Object.freeze({calculate, compare, money});
}));
