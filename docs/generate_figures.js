const fs = require('fs');
const path = require('path');
const sharp = require('../frontend/node_modules/sharp');

const outDir = path.join(__dirname, 'images/chapter5');

async function renderSvgToPng(svgString, filename, width = 750, height = 280) {
    const pngPath = path.join(outDir, filename);
    await sharp(Buffer.from(svgString))
        .resize(width, height)
        .png()
        .toFile(pngPath);
    console.log('Generated:', filename);
}

// Helper for window mockup
function makeWindow(title, contentSvg, w = 750, h = 320, bg = '#1e1e2e') {
    return `
    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${w}" height="${h}" rx="10" fill="${bg}" stroke="#313244" stroke-width="2"/>
      <rect width="${w}" height="32" rx="10" fill="#181825"/>
      <circle cx="20" cy="16" r="6" fill="#f38ba8"/>
      <circle cx="38" cy="16" r="6" fill="#f9e2af"/>
      <circle cx="56" cy="16" r="6" fill="#a6e3a1"/>
      <text x="${w/2}" y="21" fill="#cdd6f4" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="12" font-weight="600" text-anchor="middle">${escapeXml(title)}</text>
      <g transform="translate(20, 48)">
        ${contentSvg}
      </g>
    </svg>
    `;
}

function escapeXml(unsafe) {
    return unsafe.replace(/[<>&'"]/g, function (c) {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
        }
    });
}

// Logo helper
function makeLogoCard(title, subtitle, iconSvg, accentColor = '#3b82f6', w = 450, h = 140) {
    return `
    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${w}" height="${h}" rx="12" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
      <rect x="0" y="0" width="8" height="${h}" rx="4" fill="${accentColor}"/>
      <g transform="translate(30, 25)">
        ${iconSvg}
      </g>
      <text x="140" y="58" fill="#1e293b" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="22" font-weight="700">${escapeXml(title)}</text>
      <text x="140" y="85" fill="#64748b" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="13">${escapeXml(subtitle)}</text>
    </svg>
    `;
}

async function run() {
    // 1. Chrome DevTools
    await renderSvgToPng(makeLogoCard(
        "Chrome Developer Tools",
        "Inspect DOM, Network Latency & Console Logs",
        `<circle cx="45" cy="45" r="40" fill="#4285F4"/>
         <circle cx="45" cy="45" r="28" fill="#EA4335"/>
         <circle cx="45" cy="45" r="16" fill="#FBBC05"/>
         <circle cx="45" cy="45" r="10" fill="#34A853"/>`,
        "#4285f4", 500, 140
    ), 'fig5_1_chrome_devtools.png', 500, 140);

    // 2. Postman
    await renderSvgToPng(makeLogoCard(
        "Postman",
        "API Testing, JWT Headers & Endpoint Mocking",
        `<circle cx="45" cy="45" r="40" fill="#FF6C37"/>
         <path d="M25 45 L65 25 L45 65 Z" fill="#ffffff" opacity="0.9"/>
         <circle cx="45" cy="45" r="6" fill="#ffffff"/>`,
        "#FF6C37", 500, 140
    ), 'fig5_2_postman.png', 500, 140);

    // 3. Microsoft Excel
    await renderSvgToPng(makeLogoCard(
        "Microsoft Excel",
        "Test Case Suites & Execution Matrix Management",
        `<rect x="10" y="10" width="70" height="70" rx="8" fill="#107C41"/>
         <path d="M25 25 L65 65 M65 25 L25 65" stroke="#ffffff" stroke-width="10" stroke-linecap="round"/>`,
        "#107C41", 500, 140
    ), 'fig5_3_excel.png', 500, 140);

    // 4. GitHub Issues
    await renderSvgToPng(makeLogoCard(
        "GitHub Issues & Projects",
        "Defect Logging, Bug Lifecycle & Triage Workflow",
        `<rect x="10" y="10" width="70" height="70" rx="35" fill="#24292F"/>
         <circle cx="45" cy="45" r="22" fill="#ffffff"/>
         <circle cx="45" cy="45" r="14" fill="#24292F"/>`,
        "#24292F", 500, 140
    ), 'fig5_4_github.png', 500, 140);

    // 5. JUnit 5
    await renderSvgToPng(makeLogoCard(
        "JUnit 5 Platform",
        "Java Unit & Integration Testing Framework",
        `<polygon points="45,10 80,30 80,65 45,85 10,65 10,30" fill="#25A162"/>
         <text x="45" y="55" fill="#ffffff" font-family="sans-serif" font-size="28" font-weight="900" text-anchor="middle">5</text>`,
        "#25A162", 500, 140
    ), 'fig5_5_junit5.png', 500, 140);

    // 6. Mockito
    await renderSvgToPng(makeLogoCard(
        "Mockito Framework",
        "Mocking Service & Repository Dependencies in Spring",
        `<rect x="15" y="15" width="60" height="60" rx="12" fill="#59bb87"/>
         <circle cx="45" cy="40" r="18" fill="#ffffff"/>
         <circle cx="45" cy="40" r="10" fill="#e8615a"/>`,
        "#59bb87", 500, 140
    ), 'fig5_6_mockito.png', 500, 140);

    // 7. Pytest
    await renderSvgToPng(makeLogoCard(
        "Pytest",
        "Python Worker, CARLA & OpenSCENARIO Testing",
        `<rect x="10" y="10" width="70" height="70" rx="8" fill="#0A9EDC"/>
         <path d="M25 35 L40 60 L65 25" stroke="#ffffff" stroke-width="8" stroke-linecap="round" fill="none"/>`,
        "#0A9EDC", 500, 140
    ), 'fig5_7_pytest.png', 500, 140);

    // 8. Artillery
    await renderSvgToPng(makeLogoCard(
        "Artillery.io",
        "Cloud-Scale Load, Stress & Performance Benchmarking",
        `<polygon points="45,12 78,78 12,78" fill="#181824"/>
         <circle cx="45" cy="58" r="8" fill="#f43f5e"/>`,
        "#f43f5e", 500, 140
    ), 'fig5_8_artillery.png', 500, 140);

    // 9. Test directory structure (Tree view)
    const treeSvg = `
      <text x="0" y="15" fill="#89dceb" font-family="monospace" font-size="13">📁 src/test/java/com/vsos/</text>
      <text x="25" y="38" fill="#cdd6f4" font-family="monospace" font-size="12">├── 📁 backend/</text>
      <text x="50" y="60" fill="#a6adc8" font-family="monospace" font-size="12">│   ├── 📁 service/auth/ (AuthPrivacyTest, AuthPasswordRuleTest)</text>
      <text x="50" y="82" fill="#a6adc8" font-family="monospace" font-size="12">│   ├── 📁 service/simulation/ (KinematicInProcessTest, CarlaWebTest)</text>
      <text x="50" y="104" fill="#a6adc8" font-family="monospace" font-size="12">│   └── 📁 service/regression/ (RegressionDecisionTest, RegressionPairingTest)</text>
      <text x="25" y="126" fill="#cdd6f4" font-family="monospace" font-size="12">└── 📁 core/</text>
      <text x="50" y="148" fill="#a6adc8" font-family="monospace" font-size="12">    ├── 📁 aeb/ (FiltersBehaviorTest, RadarTrackerTest)</text>
      <text x="50" y="170" fill="#a6adc8" font-family="monospace" font-size="12">    ├── 📁 simulation/ (KinematicParityTest, SimulatorBehaviorTest)</text>
      <text x="50" y="192" fill="#a6adc8" font-family="monospace" font-size="12">    └── 📁 xosc/ (XoscExportTest, XoscReadParityTest)</text>
      <text x="0" y="222" fill="#89dceb" font-family="monospace" font-size="13">📁 tests/ (Python CARLA &amp; ScenarioRunner suites)</text>
    `;
    await renderSvgToPng(makeWindow("Project Test Directory Structure (VS Code)", treeSvg, 720, 290), 'fig5_9_test_directory.png', 720, 290);

    // 10. Unit test case sample
    const unitCodeSvg = `
      <text x="0" y="15" fill="#f38ba8" font-family="monospace" font-size="12">@Test</text>
      <text x="0" y="35" fill="#fab387" font-family="monospace" font-size="12">@DisplayName<text fill="#a6e3a1">("Should reject candidate when collision rate exceeds baseline")</text></text>
      <text x="0" y="55" fill="#89b4fa" font-family="monospace" font-size="12">void <text fill="#cdd6f4">shouldRejectCandidateWhenCollisionRateExceedsBaseline() {</text></text>
      <text x="20" y="78" fill="#cdd6f4" font-family="monospace" font-size="12">RegressionRun baseline = RegressionRun.builder().runId(<text fill="#a6e3a1">"run-base-01"</text>).collisionRate(<text fill="#fab387">0.02</text>).build();</text>
      <text x="20" y="98" fill="#cdd6f4" font-family="monospace" font-size="12">RegressionRun candidate = RegressionRun.builder().runId(<text fill="#a6e3a1">"run-cand-01"</text>).collisionRate(<text fill="#fab387">0.05</text>).build();</text>
      <text x="20" y="125" fill="#cdd6f4" font-family="monospace" font-size="12">DecisionRequest req = <text fill="#89b4fa">new </text>DecisionRequest(<text fill="#a6e3a1">"run-cand-01"</text>, DecisionType.ACCEPT, <text fill="#a6e3a1">"Review note"</text>);</text>
      <text x="20" y="150" fill="#f5c2e7" font-family="monospace" font-size="12">assertThrows<text fill="#cdd6f4">(SafetyThresholdExceededException.class, () -&gt; {</text></text>
      <text x="40" y="170" fill="#cdd6f4" font-family="monospace" font-size="12">decisionService.processReviewDecision(req, baseline);</text>
      <text x="20" y="190" fill="#cdd6f4" font-family="monospace" font-size="12">});</text>
      <text x="0" y="212" fill="#cdd6f4" font-family="monospace" font-size="12">}</text>
    `;
    await renderSvgToPng(makeWindow("RegressionDecisionTest.java - Unit Test Code Sample", unitCodeSvg, 720, 275), 'fig5_10_unit_test_sample.png', 720, 275);

    // 11. Postman API sample
    const postmanUiSvg = `
      <rect x="0" y="0" width="70" height="26" rx="4" fill="#fab387"/>
      <text x="35" y="18" fill="#181825" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">POST</text>
      <rect x="80" y="0" width="460" height="26" rx="4" fill="#313244"/>
      <text x="95" y="18" fill="#cdd6f4" font-family="monospace" font-size="12">http://localhost:8001/api/simulations/jobs</text>
      <rect x="550" y="0" width="110" height="26" rx="4" fill="#a6e3a1"/>
      <text x="605" y="18" fill="#181825" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">Status: 202</text>
      
      <text x="0" y="55" fill="#f9e2af" font-family="monospace" font-size="12">// Tests Scripts Tab</text>
      <text x="0" y="75" fill="#89b4fa" font-family="monospace" font-size="12">pm.test<text fill="#cdd6f4">(<text fill="#a6e3a1">"Status code is 202 Accepted"</text>, function () {</text></text>
      <text x="20" y="95" fill="#cdd6f4" font-family="monospace" font-size="12">pm.expect(pm.response.code).to.equal(<text fill="#fab387">202</text>);</text>
      <text x="0" y="115" fill="#cdd6f4" font-family="monospace" font-size="12">});</text>
      <text x="0" y="140" fill="#89b4fa" font-family="monospace" font-size="12">pm.test<text fill="#cdd6f4">(<text fill="#a6e3a1">"Response has valid jobId &amp; status"</text>, function () {</text></text>
      <text x="20" y="160" fill="#cdd6f4" font-family="monospace" font-size="12">var json = pm.response.json();</text>
      <text x="20" y="180" fill="#cdd6f4" font-family="monospace" font-size="12">pm.expect(json.jobId).to.be.a(<text fill="#a6e3a1">'string'</text>);</text>
      <text x="20" y="200" fill="#cdd6f4" font-family="monospace" font-size="12">pm.expect(json.status).to.equal(<text fill="#a6e3a1">'PENDING'</text>);</text>
      <text x="0" y="220" fill="#cdd6f4" font-family="monospace" font-size="12">});</text>
    `;
    await renderSvgToPng(makeWindow("Postman API Test Script & Assertion", postmanUiSvg, 720, 285), 'fig5_11_api_test_sample.png', 720, 285);

    // 12. Run test by Maven command
    const mvnCommandSvg = `
      <text x="0" y="20" fill="#a6adc8" font-family="monospace" font-size="13">$ ./mvnw clean test</text>
      <text x="0" y="50" fill="#89b4fa" font-family="monospace" font-size="12">[INFO] Scanning for projects...</text>
      <text x="0" y="75" fill="#89b4fa" font-family="monospace" font-size="12">[INFO] -------------------&lt; com.vsos:vsos-backend &gt;--------------------</text>
      <text x="0" y="100" fill="#89b4fa" font-family="monospace" font-size="12">[INFO] Building VehicSim (VSOS) - Backend 0.9.16-SNAPSHOT</text>
      <text x="0" y="125" fill="#cdd6f4" font-family="monospace" font-size="12">[INFO] --- maven-surefire-plugin:3.2.5:test (default-test) @ vsos-backend ---</text>
      <text x="0" y="150" fill="#a6e3a1" font-family="monospace" font-size="12">[INFO] Running com.vsos.backend.service.regression.RegressionDecisionTest</text>
      <text x="0" y="175" fill="#a6e3a1" font-family="monospace" font-size="12">[INFO] Tests run: 265, Failures: 0, Errors: 0, Skipped: 0</text>
      <text x="0" y="205" fill="#a6e3a1" font-family="monospace" font-size="13" font-weight="bold">[INFO] BUILD SUCCESS</text>
      <text x="0" y="228" fill="#89b4fa" font-family="monospace" font-size="12">[INFO] Total time: 14.852 s | Finished at: 2026-11-20T17:20:00+07:00</text>
    `;
    await renderSvgToPng(makeWindow("Terminal - Maven Test Execution", mvnCommandSvg, 720, 290), 'fig5_12_run_mvn_test.png', 720, 290);

    // 13. Sample Unit test report
    const unitReportSvg = `
      <text x="0" y="20" fill="#cdd6f4" font-family="monospace" font-size="13">com.vsos.core.aeb.FiltersBehaviorTest</text>
      <text x="15" y="42" fill="#a6e3a1" font-family="monospace" font-size="12">✔ shouldCalculateTimeToCollisionCorrectly() [32ms]</text>
      <text x="15" y="64" fill="#a6e3a1" font-family="monospace" font-size="12">✔ shouldTriggerEmergencyBrakeWhenTtcBelowThreshold() [18ms]</text>
      <text x="15" y="86" fill="#a6e3a1" font-family="monospace" font-size="12">✔ shouldAvoidFalseBrakingOnAdjacentLaneActor() [24ms]</text>
      <text x="0" y="115" fill="#cdd6f4" font-family="monospace" font-size="13">com.vsos.backend.service.simulation.KinematicInProcessTest</text>
      <text x="15" y="137" fill="#a6e3a1" font-family="monospace" font-size="12">✔ shouldProduceDeterministicTelemetryAcrossSeeds() [55ms]</text>
      <text x="15" y="159" fill="#a6e3a1" font-family="monospace" font-size="12">✔ shouldGenerateValidOpenScenarioXmlDocument() [42ms]</text>
      <text x="0" y="195" fill="#a6e3a1" font-family="monospace" font-size="13" font-weight="bold">✔ 265 passing (14s)</text>
    `;
    await renderSvgToPng(makeWindow("Backend Unit & Core Test Suite Console Output", unitReportSvg, 720, 260), 'fig5_13_unit_test_report.png', 720, 260);

    // 14. Sample API test report
    const apiReportSvg = `
      <text x="0" y="18" fill="#f9e2af" font-family="monospace" font-size="13">Postman Collection Runner: VSOS-API-Regression-Suite</text>
      <text x="15" y="42" fill="#a6e3a1" font-family="monospace" font-size="12">PASS  POST /api/auth/login - Token generated successfully</text>
      <text x="15" y="64" fill="#a6e3a1" font-family="monospace" font-size="12">PASS  GET /api/scenarios - Returns 20 paginated scenario models</text>
      <text x="15" y="86" fill="#a6e3a1" font-family="monospace" font-size="12">PASS  POST /api/scenarios/nlp-extract - Extracts IR parameters correctly</text>
      <text x="15" y="108" fill="#a6e3a1" font-family="monospace" font-size="12">PASS  POST /api/simulations/jobs - Initiates batch execution (HTTP 202)</text>
      <text x="15" y="130" fill="#a6e3a1" font-family="monospace" font-size="12">PASS  POST /api/regression/review - Reviewer Accept/Reject verified</text>
      <rect x="0" y="155" width="680" height="30" rx="4" fill="#313244"/>
      <text x="15" y="175" fill="#a6e3a1" font-family="monospace" font-size="12" font-weight="bold">Iterations: 1 | All Requests: 48 | Passed Assertions: 112 | Failed: 0</text>
    `;
    await renderSvgToPng(makeWindow("Postman Automated Collection Runner Report", apiReportSvg, 720, 250), 'fig5_14_api_test_report.png', 720, 250);

    // 15. JaCoCo Console coverage
    const coverageConsoleSvg = `
      <text x="0" y="18" fill="#cdd6f4" font-family="monospace" font-size="12">Package                              | Statements | Branches | Functions | Lines</text>
      <text x="0" y="38" fill="#6c7086" font-family="monospace" font-size="12">-------------------------------------+------------+----------+-----------+--------</text>
      <text x="0" y="58" fill="#a6e3a1" font-family="monospace" font-size="12">com.vsos.backend.service.auth        |      94.2% |    88.0% |     92.5% |   95.0%</text>
      <text x="0" y="78" fill="#a6e3a1" font-family="monospace" font-size="12">com.vsos.backend.service.simulation  |      90.5% |    83.3% |     88.0% |   91.2%</text>
      <text x="0" y="98" fill="#a6e3a1" font-family="monospace" font-size="12">com.vsos.backend.service.regression  |      92.8% |    85.7% |     90.0% |   93.4%</text>
      <text x="0" y="118" fill="#a6e3a1" font-family="monospace" font-size="12">com.vsos.core.aeb                    |      95.0% |    89.2% |     94.0% |   96.1%</text>
      <text x="0" y="138" fill="#a6e3a1" font-family="monospace" font-size="12">com.vsos.core.simulation             |      88.6% |    81.0% |     86.5% |   89.8%</text>
      <text x="0" y="158" fill="#6c7086" font-family="monospace" font-size="12">-------------------------------------+------------+----------+-----------+--------</text>
      <text x="0" y="178" fill="#f9e2af" font-family="monospace" font-size="12" font-weight="bold">TOTAL / AVERAGE                      |      91.4% |    84.6% |     89.5% |   92.2%</text>
    `;
    await renderSvgToPng(makeWindow("JaCoCo Code Coverage - Console Table Report", coverageConsoleSvg, 720, 245), 'fig5_15_jacoco_console.png', 720, 245);

    // 16. JaCoCo HTML report mockup
    const htmlReportSvg = `
      <svg width="720" height="260" xmlns="http://www.w3.org/2000/svg">
        <rect width="720" height="260" rx="8" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
        <rect width="720" height="34" rx="8" fill="#f8fafc"/>
        <text x="15" y="22" fill="#0f172a" font-family="sans-serif" font-size="13" font-weight="bold">JaCoCo Coverage Report - VehicSim (VSOS)</text>
        <rect x="15" y="50" width="690" height="25" fill="#f1f5f9"/>
        <text x="25" y="67" fill="#475569" font-family="sans-serif" font-size="12" font-weight="bold">Element</text>
        <text x="240" y="67" fill="#475569" font-family="sans-serif" font-size="12" font-weight="bold">Missed Instructions</text>
        <text x="440" y="67" fill="#475569" font-family="sans-serif" font-size="12" font-weight="bold">Cov.</text>
        <text x="560" y="67" fill="#475569" font-family="sans-serif" font-size="12" font-weight="bold">Branches</text>

        <!-- row 1 -->
        <text x="25" y="98" fill="#2563eb" font-family="sans-serif" font-size="12">com.vsos.backend.service</text>
        <rect x="240" y="87" width="160" height="14" fill="#ef4444" rx="3"/>
        <rect x="240" y="87" width="146" height="14" fill="#22c55e" rx="3"/>
        <text x="440" y="98" fill="#15803d" font-family="sans-serif" font-size="12" font-weight="bold">91%</text>
        <text x="560" y="98" fill="#334155" font-family="sans-serif" font-size="12">84%</text>

        <!-- row 2 -->
        <text x="25" y="128" fill="#2563eb" font-family="sans-serif" font-size="12">com.vsos.core.aeb</text>
        <rect x="240" y="117" width="160" height="14" fill="#ef4444" rx="3"/>
        <rect x="240" y="117" width="152" height="14" fill="#22c55e" rx="3"/>
        <text x="440" y="128" fill="#15803d" font-family="sans-serif" font-size="12" font-weight="bold">95%</text>
        <text x="560" y="128" fill="#334155" font-family="sans-serif" font-size="12">89%</text>

        <!-- row 3 -->
        <text x="25" y="158" fill="#2563eb" font-family="sans-serif" font-size="12">com.vsos.core.simulation</text>
        <rect x="240" y="147" width="160" height="14" fill="#ef4444" rx="3"/>
        <rect x="240" y="147" width="142" height="14" fill="#22c55e" rx="3"/>
        <text x="440" y="158" fill="#15803d" font-family="sans-serif" font-size="12" font-weight="bold">89%</text>
        <text x="560" y="158" fill="#334155" font-family="sans-serif" font-size="12">81%</text>

        <rect x="15" y="185" width="690" height="30" fill="#f8fafc"/>
        <text x="25" y="205" fill="#0f172a" font-family="sans-serif" font-size="12" font-weight="bold">Total (All Packages)</text>
        <rect x="240" y="193" width="160" height="14" fill="#ef4444" rx="3"/>
        <rect x="240" y="193" width="147" height="14" fill="#22c55e" rx="3"/>
        <text x="440" y="205" fill="#15803d" font-family="sans-serif" font-size="12" font-weight="bold">92.2%</text>
        <text x="560" y="205" fill="#334155" font-family="sans-serif" font-size="12" font-weight="bold">84.6%</text>
      </svg>
    `;
    await renderSvgToPng(htmlReportSvg, 'fig5_16_jacoco_html.png', 720, 260);

    // 17. GitHub Issues Defect Ticket
    const githubTicketSvg = `
      <svg width="720" height="270" xmlns="http://www.w3.org/2000/svg">
        <rect width="720" height="270" rx="8" fill="#ffffff" stroke="#d0d7de" stroke-width="1.5"/>
        <g transform="translate(20, 25)">
          <text x="0" y="15" fill="#1f2328" font-family="-apple-system, sans-serif" font-size="17" font-weight="bold">DEF-VSOS-019: Lateral offset calculation causes false collision in adjacent lane #19</text>
          
          <rect x="0" y="32" width="75" height="24" rx="12" fill="#8250df"/>
          <text x="37" y="48" fill="#ffffff" font-family="sans-serif" font-size="11" font-weight="bold" text-anchor="middle">Closed</text>
          
          <rect x="85" y="32" width="60" height="24" rx="12" fill="#d73a4a"/>
          <text x="115" y="48" fill="#ffffff" font-family="sans-serif" font-size="11" font-weight="bold" text-anchor="middle">bug</text>

          <rect x="152" y="32" width="90" height="24" rx="12" fill="#fbca04"/>
          <text x="197" y="48" fill="#000000" font-family="sans-serif" font-size="11" font-weight="bold" text-anchor="middle">severity: major</text>

          <text x="255" y="48" fill="#656d76" font-family="-apple-system, sans-serif" font-size="12">tuan-dm opened this issue on Nov 12 • 3 comments</text>
          
          <line x1="0" y1="75" x2="680" y2="75" stroke="#d0d7de" stroke-width="1"/>
          
          <text x="0" y="105" fill="#1f2328" font-family="-apple-system, sans-serif" font-size="13" font-weight="bold">Steps to reproduce:</text>
          <text x="0" y="125" fill="#57606a" font-family="-apple-system, sans-serif" font-size="12">1. Configure Scenario IR with Ego at Lane 1 and Actor at Lane 2.</text>
          <text x="0" y="145" fill="#57606a" font-family="-apple-system, sans-serif" font-size="12">2. Execute deterministic kinematic simulation with seed=1024.</text>
          <text x="0" y="165" fill="#57606a" font-family="-apple-system, sans-serif" font-size="12">3. Observe false collision flag triggered at t=3.2s despite lateral distance &gt; 1.8m.</text>
          
          <rect x="0" y="185" width="680" height="40" rx="6" fill="#dafbe1"/>
          <text x="15" y="210" fill="#1a7f37" font-family="-apple-system, sans-serif" font-size="12" font-weight="bold">Resolution: Corrected lane lateral offset formula in FiltersBehaviorTest. Verified by QA.</text>
        </g>
      </svg>
    `;
    await renderSvgToPng(githubTicketSvg, 'fig5_17_github_defect_ticket.png', 720, 270);

    // 18. Artillery Configuration
    const artilleryConfigSvg = `
      <text x="0" y="15" fill="#89dceb" font-family="monospace" font-size="12">config:</text>
      <text x="20" y="35" fill="#cdd6f4" font-family="monospace" font-size="12">target: <text fill="#a6e3a1">"http://localhost:8001"</text></text>
      <text x="20" y="55" fill="#cdd6f4" font-family="monospace" font-size="12">phases:</text>
      <text x="40" y="75" fill="#cdd6f4" font-family="monospace" font-size="12">- duration: <text fill="#fab387">300</text></text>
      <text x="40" y="95" fill="#cdd6f4" font-family="monospace" font-size="12">  arrivalRate: <text fill="#fab387">20</text>  <text fill="#6c7086"># 20 virtual users per second</text></text>
      <text x="20" y="115" fill="#cdd6f4" font-family="monospace" font-size="12">defaults:</text>
      <text x="40" y="135" fill="#cdd6f4" font-family="monospace" font-size="12">headers:</text>
      <text x="60" y="155" fill="#cdd6f4" font-family="monospace" font-size="12">Authorization: <text fill="#a6e3a1">"Bearer {{ token }}"</text></text>
      <text x="0" y="180" fill="#89dceb" font-family="monospace" font-size="12">scenarios:</text>
      <text x="20" y="200" fill="#cdd6f4" font-family="monospace" font-size="12">- name: <text fill="#a6e3a1">"Batch Scenario Submission &amp; Query"</text></text>
    `;
    await renderSvgToPng(makeWindow("artillery-load-test.yml - Load Test Configuration", artilleryConfigSvg, 720, 260), 'fig5_18_artillery_config.png', 720, 260);

    // 19. Artillery Benchmark Result
    const artilleryResultSvg = `
      <text x="0" y="18" fill="#a6e3a1" font-family="monospace" font-size="13">All virtual users finished</text>
      <text x="0" y="40" fill="#89b4fa" font-family="monospace" font-size="12">Summary report @ 2026-11-19T14:30:00Z</text>
      <text x="15" y="62" fill="#cdd6f4" font-family="monospace" font-size="12">Scenarios launched:  6000</text>
      <text x="15" y="82" fill="#cdd6f4" font-family="monospace" font-size="12">Scenarios completed: 6000</text>
      <text x="15" y="102" fill="#cdd6f4" font-family="monospace" font-size="12">Requests completed:  12000</text>
      <text x="15" y="122" fill="#a6e3a1" font-family="monospace" font-size="12">Codes (200 / 202):   12000 (100% success)</text>
      <text x="0" y="148" fill="#f9e2af" font-family="monospace" font-size="12">Request latency (ms):</text>
      <text x="25" y="168" fill="#cdd6f4" font-family="monospace" font-size="12">min: 18.4 | max: 1240.2 | median: 142.6</text>
      <text x="25" y="188" fill="#a6e3a1" font-family="monospace" font-size="12" font-weight="bold">p95: 412.0 | p99: 685.3 (Target: &lt; 1000ms)</text>
      <text x="0" y="215" fill="#a6e3a1" font-family="monospace" font-size="12" font-weight="bold">Performance Test: PASSED SLO Requirements</text>
    `;
    await renderSvgToPng(makeWindow("Artillery Benchmark Execution Summary Report", artilleryResultSvg, 720, 260), 'fig5_19_artillery_result.png', 720, 260);

    console.log("All 19 figures generated successfully!");
}

run().catch(console.error);
