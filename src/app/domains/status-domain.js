import { createStatusController } from "../status-controller.js";

export function createStatusDomain({els, state}) {
  const controller = createStatusController({els, state});

  return {
    controller,
    setStatus: (...args) => controller.setStatus(...args)
  };
}
