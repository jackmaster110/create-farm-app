import arg from "arg";
import inquirer from "inquirer";
import path from "path";
import chalk from "chalk";
import fs from "fs";
import execa from "execa";
import ncp from "ncp";
import { promisify } from "util";
import Listr from "listr";

const access = promisify(fs.access);
const copy = promisify(ncp);

async function copyTemplateFiles(options) {
    return (
        copy(options.templateDirectory, options.targetDirectory,
        {
            clobber: false,
        })
    );
}

export async function createProject(options) {
    options = {
        ...options,
        targetDirectory: options.targetDirectory || process.cwd() + "/" + options.setName,
    };
    console.log(options.targetDirectory);

    const currentFileUrl = import.meta.url;
    const templateDir = path.resolve(
        new URL(currentFileUrl).pathname,
        "../../template"
    );
    options.templateDirectory = templateDir;
    let currentWorkingDirectory = options.targetDirectory;

    try {
        await access(templateDir, fs.constants.R_OK);
    } catch (e) {
        console.error(
            `%s Cannot access template directory ${templateDir}`,
            chalk.red.bold("ERROR")
        );
        process.exit(1);
    }

    const tasks = new Listr([
        {
            title: "Copy project files",
            task: async () => await copyTemplateFiles(options),
        },
        {
            title: "Initialize react app",
            task: async () => {
                const result = await execa(
                    "yarn",
                    [
                        "create",
                        "react-app",
                        "frontend",
                        "--template",
                        "sammy-libraries"
                    ],
                    { cwd: currentWorkingDirectory }
                );
                if (result.failed) {
                    return Promise.reject(
                        new Error("Failed to initalize react app")
                    );
                }
                return;
            },
        },
        {
            title: "Initialize backend app",
            task: async () => {
                const result = await execa(
                    "pipenv",
                    ["install", "-r", "requirements.txt"],
                    { cwd: currentWorkingDirectory + "/backend" }
                );
                if (result.failed) {
                    return Promise.reject(
                        new Error("Failed to install backend dependencies")
                    );
                }
                return;
            },
            enabled: () => !options.disableInstall,
        },
        {
            title: "Initialize git repo",
            task: async () => {
                const result = await execa("git", ["init"], {
                    cwd: currentWorkingDirectory,
                });
                if (result.failed) {
                    return Promise.reject(
                        new Error("Failed to initialize git repo")
                    );
                }
                return;
            },
            enabled: () => !options.disableGit,
        },
    ]);


    await tasks.run();
    console.log("%s Project ready", chalk.green.bold("DONE"));
    return true;
}

function parseArgumentsIntoOptions(rawArgs) {
    const args = arg(
        {
            "--name": String,
            "--no-git": Boolean,
            "--no-install": Boolean,
            "--yes": Boolean,
            "-i": "--no-install",
            "-y": "--yes",
        },
        {
            argv: rawArgs.slice(2),
        }
    );

    return {
        skipPrompts: args["--yes"] || false,
        setName: args["--name"] || "farm-stack-app",
        disableGit: args["--no-git"] || false,
        disableInstall: args["--no-install"] || false,
    };
}

async function promptForMissingOptions(options) {
    if (options.skipPrompts) {
        return {
            ...options,
        };
    }

    const questions = [];
    if (!options.setname) {
        questions.push({
            name: "setName",
            message: "What is the name of the project?",
            default: "farm-stack-app",
        });
    }

    if (!options.disableGit) {
        questions.push({
            type: "confirm",
            name: "disableGit",
            message: "Disable git repo?",
            default: false,
        });
    }

    if (!options.disableInstall) {
        questions.push({
            type: "confirm",
            name: "disableInstall",
            message: "Don't install dependencies automatically?",
            default: false,
        });
    }

    const answers = await inquirer.prompt(questions);
    return {
        ...options,
        setName: options.setName || answers.setName,
        disableGit: options.disableGit || answers.disableGit,
        disableInstall: options.disableInstall || answers.disableInstall,
    };
}

export async function cli(args) {
    let options = parseArgumentsIntoOptions(args);
    options = await promptForMissingOptions(options);
    await createProject(options);
}
