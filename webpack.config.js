const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

const dist = path.resolve(__dirname, "dist");

module.exports = {
    mode: "production",
    entry: {
        index: "./js/index.js"
    },
    output: {
        path: dist,
        filename: "[name].js"
    },
    devServer: {
        static: dist,
    },
    experiments: {
        asyncWebAssembly: true,
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                path.resolve(__dirname, "static")
            ]
        }),
    ],
};
