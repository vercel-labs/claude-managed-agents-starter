import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@anthropic-ai/sdk"],
};

export default withWorkflow(nextConfig);
