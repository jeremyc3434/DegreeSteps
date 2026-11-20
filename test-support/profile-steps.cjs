'use strict';
// A fresh student who picks an exact degree is asked three short profile
// questions (starting point, study fit, priorities) before the course plan
// opens. Browser journeys that are not about those questions accept the
// defaults shown on each step, exactly as a student pressing Continue would.
async function completeProfileSteps(page, {maxSteps = 4} = {}) {
  const form = page.locator('#portal-profile-form');
  for (let i = 0; i < maxSteps; i++) {
    // The questions render after the degree choice is saved; a student who
    // already answered them goes straight to the plan instead.
    await page.waitForFunction(() => !/\/portal\.html/.test(location.pathname) || document.querySelector('#portal-profile-form'), null, {timeout: 10000}).catch(() => {});
    if (!/\/portal\.html/.test(page.url()) || !(await form.count())) return i;
    const step = await form.getAttribute('data-profile-step');
    await form.locator('button[type=submit]').click();
    await page.waitForFunction(previous => {
      const current = document.querySelector('#portal-profile-form');
      return !current || current.dataset.profileStep !== previous;
    }, step).catch(() => {});
  }
  return maxSteps;
}
module.exports = {completeProfileSteps};
