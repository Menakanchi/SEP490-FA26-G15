# OpenSCENARIO 1.0 test schema

`OpenSCENARIO_1_0.xsd` is the ASAM OpenSCENARIO V1.0.0 schema vendored from
CARLA ScenarioRunner tag `v0.9.15`:

`srunner/openscenario/OpenSCENARIO.xsd`

Source: <https://github.com/carla-simulator/scenario_runner/blob/v0.9.15/srunner/openscenario/OpenSCENARIO.xsd>

SHA-256: `E75A4475573866ACF921DB8849D6D5195BD66D155B6BCC78DAAEB590B723354A`

Keeping this file in the repository makes XSD validation deterministic and
prevents CI from silently skipping the converter contract when the network or
an environment variable is unavailable.
