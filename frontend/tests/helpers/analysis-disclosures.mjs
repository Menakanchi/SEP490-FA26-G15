/** Test-only user interactions for FE-R1 progressive disclosure. Never mutate DOM open flags. */
export async function openDisclosure(page, label) {
  const summary = page.locator("summary").filter({ hasText: new RegExp("^" + label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$") });
  await summary.waitFor({ state: "visible" });
  if (!await summary.evaluate(node => node.parentElement.open)) await summary.click();
}
export async function closeInvestigation(page) {
  const details = page.locator("[data-run-investigation]");
  if (await details.getAttribute("open") !== null) await details.locator(":scope > summary").click();
}
export async function openRunContext(page) {
  await openDisclosure(page, "Điều tra chuyên sâu");
  await openDisclosure(page, "Chỉ số bổ sung và nguồn đo");
}
export async function openOverview(page) {
  const details = page.locator("[data-analysis-overview-details]");
  await details.locator(":scope > summary").waitFor();
  if (await details.getAttribute("open") === null) await details.locator(":scope > summary").click();
  const first = details.locator("details[data-simulator]").first();
  if (await first.count() && await first.getAttribute("open") === null) await first.locator(":scope > summary").click();
}
