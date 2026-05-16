module.exports = {
  apps: [{
    name: "orca-slicer-api",
    script: "./dist/src/index.js",
    node_args: "--env-file=.env",
    env: {
      NODE_ENV: "production"
    }
  }]
}