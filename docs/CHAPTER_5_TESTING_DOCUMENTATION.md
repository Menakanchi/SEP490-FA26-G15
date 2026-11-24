# CHAPTER 5 : SOFTWARE TESTING DOCUMENTATION

---

## 5.1 Purpose

The primary purpose of this chapter is to detect and prevent defects which may be created by developers while developing the software and this may lead to software failures. On the other hand, another objective of this chapter is to provide information about the level of quality and to make sure that the end result meets the business and user requirements. It contains the following sections:
* Scope of Testing.
* Testing Tool and Environment.
* Resources and responsibilities.
* Test strategy: Test approach, test stages.
* Test schedule.
* Feature to be tested.
* Feature not to be tested.
* Defect Log.
* Test report.

---

### Scope of testing

#### Testing phases
There are 4 phases in Testing Process: Unit testing, Integration testing, System testing and Acceptance testing.

| ID | Testing Phase | Description |
|:---|:---|:---|
| 1 | Unit testing | The main aim of this endeavor is to determine whether the application functions as designed. In this phase, a unit can refer to a function, individual program or even a procedure, and a White-box Testing method is usually used to get the job done. |
| 2 | Integration testing | Integration testing allows individuals the opportunity to combine all of the units within a program and test them as a group. This testing level is designed to find interface defects between the modules/functions. This is particularly beneficial because it determines how efficiently the units are running together. |
| 3 | System testing | System testing is the first level in which the complete application is tested as a whole. The goal at this level is to evaluate whether the system has complied with all of the outlined requirements and to see that it meets Quality Standards. |
| 4 | Acceptance testing | Acceptance testing (or User Acceptance Testing), is conducted to determine whether the system is ready for release. During this phase, the tester and some alpha test user will test the system to find out whether the application meets their business’ needs. |

#### Testing types
* GUI testing
* Function testing
* Performance testing
* Regression testing
* Acceptance testing including alpha testing
* Unit testing
* Load testing

#### Testing range
Team performs all functions defined in the SRS based on the approved version.

---

## 5.2 Test plan

### Testing tools and environment

#### 5.2.1.1 Testing tools

##### 5.2.1.1.1 VSOS Front-end and Project testing
* Chrome DevTools: To view logs, inspect elements.
* GitHub Issues: To manage bugs: Show all bugs and life cycle of process to resolve bug.
* Microsoft Excel: To manage test cases.
* Postman: To manage the list of all APIs and manually test API.

##### 5.2.1.1.2 VSOS Backend and Simulation testing
* JUnit 5: A feature-rich Java testing framework running on Java 21, used to make unit and integration testing simple.
* Mockito: Mocking library for Spring Boot, to help assert and isolate service dependencies.
* Pytest: Testing framework for Python worker components, validating CARLA adapters and OpenSCENARIO schema exports.
* Artillery: Modern load-testing framework to estimate web server performance under high workload.

#### 5.2.1.2 Testing environment

| Type of testing | Software | Hardware |
|:---|:---|:---|
| System test and Acceptance test | * Microsoft Office Excel 2016<br>* Chrome Version 120+ | Personal computer for developing with the minimum configuration:<br>* Windows 10/11 64-bit or macOS<br>* Intel Core i5 / Apple Silicon<br>* Installed memory (RAM): 16.00GB |
| Unit testing and API testing | * OpenJDK 21<br>* JUnit 5 / Mockito<br>* Pytest v8.0+ | Personal computer for developing with the minimum configuration:<br>* CPU: 4 Cores<br>* Installed memory (RAM): 16.00GB |

---

### Resources and responsibilities

| ID | Resources | Responsibilities |
|:---|:---|:---|
| 1 | Project Manager | * Responsible for Project Schedules and overall success of the project.<br>* Review Test-case and report. |
| 2 | Tester | * Performing the actual system testing.<br>* Manage test resource and assign test tasks.<br>* Create Test Plan, Test Cases, and Test Report.<br>* Execute Test and log defect report. |
| 3 | Developer | * Create unit test and integration test scripts.<br>* Fix bugs. |

---

### Test strategy

#### 5.2.3.1 Testing model
Overall, VehicSim (VSOS) project uses the Iterative and Incremental Software Process Model, VehicSim is divided into 2 sub-systems: VSOS API and VSOS Frontend. In each phase of process, we use specific process for each sub-system team to fit the requirement, the characteristic and the human resource of each team.

Since APIs lack GUI and need to change source code rapidly as VSOS Frontend requires, so that VSOS API applies Test-driven development (TDD) and Behavior Driven Development (BDD) process, which covers source code by Unit testing and API testing at the message layer. In the development time, whenever we add a new feature or change the old features, we will add/modify the tests first, then write code to make the test pass then refactor the code and refactor the test at the last.

VSOS API has 2 levels of test:
* Unit testing: Automation tests that cover logic of service and core physics classes.
* API testing: Automation tests that involve testing APIs directly (in isolation) to determine whether APIs return the correct response (in the expected format) for a broad range of feasible requests, react properly to edge cases such as failures and unexpected/extreme inputs.

VSOS Frontend works mostly with GUI instead of logic and it depends on VSOS API, so that VSOS Frontend applies System testing which covers the whole VSOS system.

#### 5.2.3.2 Testing types
Testing VehicSim Project will be carried out in each release package as defined in project plan and will depend on internal delivery by development side. Critical tests will be defined as any new or modified tests for the VehicSim system. Project Manager will decide which closed defects the test team cannot determine.

Each type of VehicSim Project Testing will be designated to cover a level of project, from each model level, API level, VSOS API sub-system level and VSOS Project level with Unit testing combined with Database testing, API testing, System testing and Acceptance testing. On the other hand, VehicSim will use several of testing type to prevent defects from code modifications and latent bugs.

The different types of testing that will be carried out this project are:
* **Unit testing:** Testing all individual implemented methods, functions of core physics and service classes. Unit test also includes database testing to verify constraint, transaction, default value, data types, data format which are mentioned in database design and software requirement.
* **API testing:** Involves testing APIs directly to determine if they meet expectations for functionality, reliability, performance, and security. API testing will test all of individual implemented API of VSOS API.
* **UI testing:** User Interface testing verifies a user's interaction with the software. The goal of GUI testing is to ensure that the GUI provides the user with an appropriate access and navigation through the functions of the target-of-test. In addition, GUI testing ensures that the objects within the GUI function as expected and conform to requirement.
* **Performance testing:** The testing is executed by developers to estimate a web server performance in order to find if the server can serve sufficiently high workload by using Artillery.

#### 5.2.3.3 Testing phases
Table below are the stages in which common tests are executed:

| Testing type | Unit testing | Integration testing | System testing | Acceptance testing |
|:---|:---:|:---:|:---:|:---:|
| Unit Testing | x | x | x | |
| API Testing | x | x | | |
| UI Testing | | | | x |
| Regression Testing | x | x | x | x |
| Performance Testing | | | x | x |
| Acceptance Testing | | | x | |
| Load Testing | | | x | x |

Table 5-1: Testing phase

#### 5.2.3.4 Test schedule
Table below is the Test Schedule for VehicSim Project:

| Test Schedule | Start Date | End Date |
|:---|:---|:---|
| **Phase 1: Core Engine and Auth features** | 6/19/2026 | 7/9/2026 |
| Unit Testing and API Testing | 6/19/2026 | 7/8/2026 |
| User Interface Testing | 7/1/2026 | 7/2/2026 |
| System Testing | 6/30/2026 | 7/9/2026 |
| Performance Tests | 7/8/2026 | 7/8/2026 |
| Regression Tests | 7/9/2026 | 7/9/2026 |
| **Phase 2: Simulation, MOBO and Optimization** | 7/13/2026 | 8/9/2026 |
| Unit Testing and API Testing | 7/13/2026 | 8/8/2026 |
| User Interface Testing | 8/1/2026 | 8/2/2026 |
| System Testing | 7/30/2026 | 8/9/2026 |
| Performance Tests | 8/7/2026 | 8/7/2026 |
| Regression Tests | 8/8/2026 | 8/8/2026 |
| Acceptance testing | 8/9/2026 | 8/9/2026 |

Table 5-2: Test schedule

#### 5.2.3.5 Deliverables
Table below is the Deliverables for VehicSim Project:

| Deliverables | Responsibilities | Complete date |
|:---|:---|:---|
| **Phase 1** | | |
| Test Plan | Tester | 6/21/2026 |
| Test Cases | Tester | 6/29/2026 |
| Test case review | Tester + PM | 6/30/2026 |
| Defect report | All members | 7/8/2026 |
| **Phase 2** | | |
| Test Plan | Tester | 7/16/2026 |
| Test Cases | Tester | 7/26/2026 |
| Test case review | Tester + PM | 8/7/2026 |
| Defect report | All members | 8/7/2026 |
| Final test Summary report | PM | 8/10/2026 |

Table 5-3: Deliverables schedule

---

### Features to be tested

| Actor | Name |
|:---|:---|
| **Engineer / Reviewer** | * Reset Password<br>* Login / Logout<br>* View workspace list<br>* View project information detail<br>* Create scenario from Natural Language prompt<br>* View & edit Scenario IR<br>* Preview 3D Scenario layout<br>* Configure Scenario Family variations<br>* Batch variation generation<br>* Run Kinematic Simulation<br>* Run CARLA Headless Simulation<br>* View Simulation Telemetry Replay<br>* View failure root-cause analysis<br>* Run MOBO Optimization<br>* View Pareto frontier candidates<br>* Compare candidate vs baseline<br>* Accept / Reject candidate profile<br>* Export OpenSCENARIO (.xosc)<br>* Import OpenSCENARIO (.xosc) |
| **Admin / Manager** | * Create account<br>* Delete account<br>* Change account role<br>* Change account status<br>* Assign project members<br>* View audit trail logs |

Table 5-4: Features to be tested

---

### Features not to be tested

* Hardware-in-the-Loop (HIL) real vehicle ECU integration.
* Commercial payment gateway processing.

---

## 5.3 Test Case

### Automation testing with API testing and Unit testing

Unit testing and API testing will be done by the developers and approved by team leader.
The VehicSim development team embrace this feature to gain the following advantages:
* Reduce the level of bugs in production code.
* Save development time.
* Automation tests can be run as frequently as required.
* Make it easier to change and refactor code by improving the design of code especially with Test-Driven Development.
* Can easily form a document from the tests.
* Easier to maintain than GUI tests which are difficult to maintain with the short release cycles and frequent changes and with a complex system.
* Reduce cost of resource to corresponding GUI testing.

#### 5.3.1.1 Automation testing framework
* For API testing and Unit testing, we use JUnit 5 testing framework combined with Mockito assertion library and JaCoCo for code coverage observation.
* All automation test scripts are organized systematically in the `src/test/java` directory:

```text
src/test/java/com/vsos/
├── core/
│   ├── KinematicInProcessTest.java
│   └── FiltersBehaviorTest.java
├── regression/
│   └── RegressionDecisionTest.java
├── scenario/
│   └── ScenarioIrParserTest.java
└── simulation/
    └── CarlaBridgeClientTest.java
```

* **Unit test case sample:**
The sample below checks if `RegressionDecisionService` handles the case that candidate collision rate exceeds baseline threshold:

```java
@Test
void shouldRejectCandidateWhenCollisionRateExceedsBaseline() {
    RegressionRun baseline = RegressionRun.builder().collisionRate(0.02).build();
    RegressionRun candidate = RegressionRun.builder().collisionRate(0.05).build();
    DecisionRequest request = new DecisionRequest("run-01", DecisionType.ACCEPT);
    when(runRepository.findById("run-01")).thenReturn(Optional.of(candidate));
    assertThrows(SafetyThresholdExceededException.class, () -> {
        decisionService.processReviewDecision(request, baseline);
    });
}
```

* **API test case sample:**
Test behavior of HTTP POST method which is used to submit a simulation job with valid Bearer token:

```javascript
pm.test("Status code is 202 Accepted", function () {
    pm.response.to.have.status(202);
});
pm.test("Response contains valid simulation jobId", function () {
    const jsonData = pm.response.json();
    pm.expect(jsonData).to.have.property("jobId");
    pm.expect(jsonData.status).to.eql("QUEUED");
});
```

* Test cases are executed automatically by using Maven in command line:

```bash
./mvnw clean test
```

By using Maven combining with JaCoCo, test report can be exported in 2 formats: static html and console table.

---

### System testing

Detailed Test cases will be described in `VSOS_TestCase.xlsx` file.

As a standard definition, VehicSim Project defines that a test case is:
A set of test data and test programs (test scripts) and their expected results. A test case validates one or more system requirements and generates a pass or fail.

A good test case should follow two basic aspects, the Contents and the Style. Test cases for functional testing are derived from the target of test's use cases. Test cases should be developed for each use case scenario. The use case scenarios are identified by describing the paths through the use case that traverse the basic flow and alternate flows start to finish through the use case.

By using good automation test, VehicSim Project System testing will not focus on common logic of system like length of text but focus on behavior of website and aims to validate that all software module dependencies are functionally correct and that data integrity is maintained between separate modules for the entire solution.

---

### Acceptance testing

Acceptance Testing is a level of the software testing process where a system is tested for acceptability. The purpose of this test is to evaluate the system’s compliance with the business requirements and assess whether it is acceptable for delivery. But our project will use the Checklists as a substitute for Acceptance testing.

The content of the Checklist is shown in the table below:

| ID | Checklists | Yes | No |
|:---|:---|:---:|:---:|
| **General** | | | |
| CL-001 | Text on all pages for spelling and grammatical errors. | √ | |
| CL-002 | Functionality of buttons available on all pages. | √ | |
| CL-003 | Page title displayed correctly on browser tab. | √ | |
| CL-004 | Responsive layout on common desktop screen resolutions. | √ | |
| CL-005 | Form validation messages displayed on empty required fields. | √ | |
| CL-006 | Login redirection works properly upon successful authentication. | √ | |
| CL-007 | System shows error alert when login with incorrect password. | √ | |
| CL-008 | User session token is cleared on logout. | √ | |
| CL-009 | Non-authenticated users redirected to login page. | √ | |
| CL-010 | Role-based route access restriction enforced. | √ | |
| **Workspace & Scenario** | | | |
| CL-011 | Workspace list rendered with metadata. | √ | |
| CL-012 | Workspace creation modal adds record to database. | √ | |
| CL-013 | Project creation under workspace works as expected. | √ | |
| CL-014 | Member role assignment updates permissions immediately. | √ | |
| CL-015 | NLP prompt input field accepts up to 2000 characters. | √ | |
| CL-016 | Scenario IR extracted successfully from text prompt. | √ | |
| CL-017 | Visual editing of Scenario IR parameters updates preview. | √ | |
| CL-018 | 3D canvas renders vehicle bounding boxes and lane lines. | √ | |
| CL-019 | Parameter range variation generator creates child scenarios. | √ | |
| CL-020 | OpenSCENARIO (.xosc) XML export produces valid schema. | √ | |
| CL-021 | External OpenSCENARIO (.xosc) file imported without errors. | √ | |
| **Simulation & Safety** | | | |
| CL-022 | Kinematic simulation job queued and executed successfully. | √ | |
| CL-023 | Telemetry time-series charts plotted continuously. | √ | |
| CL-024 | TTC and ETTC safety indicators calculated accurately. | √ | |
| CL-025 | Collision point detected at exact contact timestamp. | √ | |
| CL-026 | CARLA headless execution bridge connects and streams data. | √ | |
| CL-027 | CARLA connection failure displays friendly notification. | √ | |
| CL-028 | 3D simulation replay timeline scrubber seeks smoothly. | √ | |
| CL-029 | Camera view switching between Follow, Top-down, Free modes. | √ | |
| CL-030 | Root-cause failure classifier tags collision reasons. | √ | |
| **Optimization & Review** | | | |
| CL-031 | MOBO optimization generates Pareto frontier candidates. | √ | |
| CL-032 | Candidate comparison view displays metrics delta. | √ | |
| CL-033 | Candidate profile approval promotes active profile. | √ | |
| CL-034 | Candidate rejection records reviewer feedback comment. | √ | |
| CL-035 | Audit log tracks all profile promotions and deletions. | √ | |
| **Performance & Database** | | | |
| CL-036 | Database fields designed with correct data types and constraints. | √ | |
| CL-037 | Correct data is saved in database upon successful form submit. | √ | |
| CL-038 | Real time WebSocket connection stays alive during simulation. | √ | |
| CL-039 | Page load time is within acceptable range (< 2s). | √ | |
| CL-040 | Load testing of application under concurrent requests. | √ | |

Table 5-5: Check list table

---

### Defect Log

VehicSim project used GitHub Issues to manage tasks and defects.

PM created VehicSim project in GitHub Issues and added other members’ email to allow the team take part in activities: control bugs, fix bugs, re-test bugs and close bug. Bug will be logged by tester or developer in develop progress.

---

## 5.4 Test Report

### Automation test case report

The contents of the Automation Test Case Report are shown in the table below:

| Type of test case | Test Case | Pass | Fail | Not available | Number of Test Case |
|:---|:---|:---:|:---:|:---:|:---:|
| **API Test – Auth** | Login | 4 | 0 | 0 | 4 |
| | Refresh token | 2 | 0 | 0 | 2 |
| | Logout | 1 | 0 | 0 | 1 |
| | Reset password | 3 | 0 | 0 | 3 |
| | **Total** | **10** | **0** | **0** | **10** |
| **API Test – Workspace** | Get all workspaces | 2 | 0 | 0 | 2 |
| | Create workspace | 3 | 0 | 0 | 3 |
| | Add member to project | 3 | 0 | 0 | 3 |
| | Update project role | 2 | 0 | 0 | 2 |
| | **Total** | **10** | **0** | **0** | **10** |
| **API Test – Scenario** | Create scenario IR | 4 | 0 | 0 | 4 |
| | Parse NLP prompt | 5 | 0 | 0 | 5 |
| | Update IR parameters | 4 | 0 | 0 | 4 |
| | Export .xosc | 3 | 0 | 0 | 3 |
| | Import .xosc | 4 | 0 | 0 | 4 |
| | **Total** | **20** | **0** | **0** | **20** |
| **API Test – Simulation** | Submit kinematic simulation | 5 | 0 | 0 | 5 |
| | Get simulation status | 4 | 0 | 0 | 4 |
| | Get telemetry stream | 5 | 0 | 0 | 5 |
| | Cancel simulation job | 2 | 0 | 0 | 2 |
| | CARLA dispatch job | 4 | 0 | 0 | 4 |
| | **Total** | **20** | **0** | **0** | **20** |
| **API Test – Optimization** | Run MOBO optimization | 5 | 0 | 0 | 5 |
| | Get Pareto candidates | 4 | 0 | 0 | 4 |
| | Accept candidate profile | 3 | 0 | 0 | 3 |
| | Reject candidate profile | 3 | 0 | 0 | 3 |
| | **Total** | **15** | **0** | **0** | **15** |
| **Unit Test – Core** | TTC / ETTC calculation | 15 | 0 | 0 | 15 |
| | Kinematics displacement | 12 | 0 | 0 | 12 |
| | Lateral clearance filter | 10 | 0 | 0 | 10 |
| | Regression decision threshold | 8 | 0 | 0 | 8 |
| | CARLA schema validator | 15 | 0 | 0 | 15 |
| | **Total** | **60** | **0** | **0** | **60** |
| **Total of Test Case** | | **135** | **0** | **0** | **135** |

Table 5-6: Automation test case report

---

### Automation test report

Automation test is an integral part of development process. So that, there are 2 phases as 2 phases of Iterative and Incremental Software Process Model.

| Test case | Phase 1 Pass | Fail | Phase 2 Pass | Fail | Final |
|:---|:---:|:---:|:---:|:---:|:---:|
| API Test – Auth | 6 | 0 | 4 | 0 | 10 |
| API Test – Workspace | 4 | 0 | 6 | 0 | 10 |
| API Test – Scenario | 8 | 0 | 12 | 0 | 20 |
| API Test – Simulation | 10 | 0 | 10 | 0 | 20 |
| API Test – Optimization | 0 | 0 | 15 | 0 | 15 |
| Unit Test – Core & Kinematics | 32 | 0 | 28 | 0 | 60 |
| **Total of Test Case** | **60** | **0** | **75** | **0** | **135** |

Table 5-7: Automation test report

---

### System test case report

The contents of the System Test Case Report are shown in the table below:

| Module | Test Case | Pass | Fail | Not available | Number of Test Case |
|:---|:---|:---:|:---:|:---:|:---:|
| **Authorization** | View Login form | 1 | 0 | 0 | 1 |
| | Login by valid account | 2 | 0 | 0 | 2 |
| | Login by invalid password | 2 | 0 | 0 | 2 |
| | Logout | 1 | 0 | 0 | 1 |
| | Role-based route guard | 2 | 0 | 0 | 2 |
| | **Total** | **8** | **0** | **0** | **8** |
| **Workspace** | View workspace list | 2 | 0 | 0 | 2 |
| | Create workspace | 2 | 0 | 0 | 2 |
| | Assign member to project | 3 | 0 | 0 | 3 |
| | **Total** | **7** | **0** | **0** | **7** |
| **Scenario Studio** | Natural language to IR | 3 | 0 | 0 | 3 |
| | Edit IR parameter | 3 | 0 | 0 | 3 |
| | 3D canvas preview | 2 | 0 | 0 | 2 |
| | Generate variations | 3 | 0 | 0 | 3 |
| | Export / Import .xosc | 3 | 0 | 0 | 3 |
| | **Total** | **14** | **0** | **0** | **14** |
| **Simulation** | Run kinematic simulation | 4 | 0 | 0 | 4 |
| | View telemetry curves | 3 | 0 | 0 | 3 |
| | 3D replay timeline | 3 | 0 | 0 | 3 |
| | CARLA headless execution | 4 | 0 | 0 | 4 |
| | Failure root-cause report | 2 | 0 | 0 | 2 |
| | **Total** | **16** | **0** | **0** | **16** |
| **Optimization** | Run MOBO optimization | 3 | 0 | 0 | 3 |
| | View Pareto candidates | 2 | 0 | 0 | 2 |
| | Compare candidate vs baseline | 3 | 0 | 0 | 3 |
| | Accept / Reject candidate | 2 | 0 | 0 | 2 |
| | **Total** | **10** | **0** | **0** | **10** |
| **Total of Test Case** | | **55** | **0** | **0** | **55** |

Table 5-8: System test case report

**Test case list:**

| ID | Test Case Description | Test Case Procedure | Expected Output | Status |
|:---|:---|:---|:---|:---:|
| **[Auth-1]** | View Login | 1. Access `http://localhost:3000/login`<br>2. Observe page layout | 1. Login page is displayed.<br>2. System displays Email field, Password field, and 'Đăng nhập' button. | Pass |
| **[Auth-2]** | Login by valid account | 1. Enter valid email<br>2. Enter valid password<br>3. Click 'Đăng nhập' button | 1. System redirects to Dashboard.<br>2. User profile and session token loaded. | Pass |
| **[Auth-3]** | Login by invalid password | 1. Enter valid email<br>2. Enter wrong password<br>3. Click 'Đăng nhập' button | System displays error alert: 'Thông tin đăng nhập không chính xác'. | Pass |
| **[Scen-1]** | Natural Language to IR | 1. Access Scenario Studio<br>2. Enter prompt 'Xe phía trước phanh gấp'<br>3. Click 'Trích xuất IR' | Scenario IR generated with speed and deceleration parameters. | Pass |
| **[Sim-1]** | Run Kinematic Simulation | 1. Select scenario variation<br>2. Click 'Chạy mô phỏng' | Job completes in < 2 seconds; telemetry curves plotted. | Pass |

For more details about all test suites, please look at file “VSOS_TestCase.xlsx”

---

### System test report

We execute test in 2 phases of process model, to finish project. With 2nd phase, we test with 2 small tasks:
The first one: re-test phase 1 and implemented function of phase 2
The last one: test all test case and re-test to confirm bug
The contents of the Test Report are shown in the table below:

| Module | Phase 1 Pass | Fail | Phase 2-1 Pass | Fail | Phase 2-2 Pass | Fail | Final |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Authorization | 4 | 1 | 6 | 1 | 8 | 0 | 8 |
| Workspace | 3 | 0 | 5 | 1 | 7 | 0 | 7 |
| Scenario Studio | 6 | 2 | 10 | 1 | 14 | 0 | 14 |
| Simulation | 8 | 2 | 12 | 2 | 16 | 0 | 16 |
| Optimization | 0 | 0 | 8 | 1 | 10 | 0 | 10 |
| **Total all Test Case** | **21** | **5** | **41** | **6** | **55** | **0** | **55** |

Table 5-9: System test report

---

### Benchmarks

#### 5.4.5.1 Requirements
We did some benchmarks to see if we have any issues with performance of the system.
Because of limited resource, our target is that the system should be able to serve 20 users per second with the response time less than 500ms.

#### 5.4.5.2 Benchmark Tool
We use Artillery to do our benchmark. Artillery is a modern load-testing framework. It offers rich functionality, has a strong focus on developer happiness, and is open-source. It supports: HTTPS, WebSockets, Scriptable, HTML reports.

#### 5.4.5.3 Benchmark implementation
With Artillery we can write a benchmark script that simulates realistic user behavior with scenarios.
We will configure the Artillery as following:
* Run on address: `http://localhost:8001`
* We include a valid token to every request.
* There will be 20 virtual users created and lasts for 300 seconds.

```yaml
config:
  target: "http://localhost:8001"
  phases:
    - duration: 300
      arrivalRate: 20
  defaults:
    headers:
      Authorization: "Bearer {{ token }}"
scenarios:
  - name: "Fetch Scenarios and Submit Simulation Job"
    flow:
      - get:
          url: "/api/scenarios?page=0&size=20"
      - post:
          url: "/api/simulations/jobs"
          json:
            scenarioId: "scen-baseline-001"
            aebProfileId: "aeb-profile-euro-ncap"
```

Then we run the benchmark with command:
`artillery run benchmark.yml`

#### 5.4.5.4 Benchmark result
The benchmark shows that our system works as expected as we defined in the first place:
At request latency, the maximum response time is 1240 ms for REST API.
The median response time is 142.6 ms for REST API.
The p99 latency is 685.3 ms for REST API (p99 means that 99% of the requests should be faster than given latency).
