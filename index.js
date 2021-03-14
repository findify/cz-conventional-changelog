const wrap = require('word-wrap');
const chalk = require('chalk');
const { getPackagesSync } = require("@lerna/project");
const shell = require('shelljs');
const path = require('path');

const filter = (array) => array.filter((x) => x);
const headerLength = (answers) => answers.type.length + 2 + (answers.scope ? answers.scope.length + 2 : 0);
const maxSummaryLength = (options, answers) => options.maxHeaderWidth - headerLength(answers);

const filterSubject = (subject, disableSubjectLowerCase) => {
  subject = subject.trim();
  if (!disableSubjectLowerCase && subject.charAt(0).toLowerCase() !== subject.charAt(0)) {
    subject =
      subject.charAt(0).toLowerCase() + subject.slice(1, subject.length);
  }
  while (subject.endsWith('.')) {
    subject = subject.slice(0, subject.length - 1);
  }
  return subject;
};


const getChangedPackages = (allPackages) => {
  const changedFiles = shell.exec('git diff --cached --name-only', { silent: true })
    .stdout
    .split('\n')
    .map(path.normalize);

  return allPackages
    .filter(function (pkg) {
      const packagePrefix = path.relative('.', pkg.location) + path.sep;
      for (let changedFile of changedFiles) {
        if (changedFile.indexOf(packagePrefix) === 0) {
          return true;
        }
      }
    })
    .map(function (pkg) {
      return pkg.name
    });
}

function makeAffectsLine(answers) {
  const selectedPackages = answers.packages;
  if (selectedPackages && selectedPackages.length) {
    return `affects: ${selectedPackages.join(', ')}`;
  }
}

const packages = (() => {
  const pkgs = getPackagesSync();
  return {
    all: pkgs.map(p => p.name),
    changed: getChangedPackages(pkgs)
  }
})();

const options = {
  maxHeaderWidth: 100,
  disableSubjectLowerCase: false
}

module.exports = {
  // When a user runs `git cz`, prompter will
  // be executed. We pass you cz, which currently
  // is just an instance of inquirer.js. Using
  // this you can ask questions and get answers.
  //
  // The commit callback should be executed when
  // you're ready to send back a commit template
  // to git.
  //
  // By default, we'll de-indent your commit
  // template and will keep empty lines.
  prompter(cz, commit) {
    // Let's ask some questions of the user
    // so that we can populate our commit
    // template.
    //
    // See inquirer.js docs for specifics.
    // You can also opt to use another input
    // collection library if you prefer.
    cz.prompt([
      {
        type: 'list',
        name: 'type',
        message: "Select the type of change that you're committing:",
        choices: [
          {value: 'fix',      name: `fix:      🛠  Bug fix (note: indicate a ${chalk.green('minor')} release)`},
          {value: 'feat',     name: `feat:     ✨ Feature (note: indicate a ${chalk.red('major')} release)`},
          {value: 'docs',     name: 'docs:     Documentation only changes'},
          {value: 'style',    name: 'style:    Changes that do not affect the meaning of the code'},
          {value: 'refactor', name: 'refactor: A code change that neither fixes a bug nor adds a feature'},
          {value: 'perf',     name: 'perf:     A code change that improves performance'},
          {value: 'test',     name: 'test:     Adding missing tests'},
          {value: 'chore',    name: 'chore:    Changes to the build process or auxiliary tools'},
          {value: 'revert',   name: 'revert:   Revert to a commit'},
          {value: 'WIP',      name: 'WIP:      Work in progress'}
        ],
      },
      {
        type: 'checkbox',
        name: 'scope',
        message: `The packages that this commit has affected (${packages.all.length} detected)`,
        default: packages.changed,
        choices: packages.all
      },
      {
        type: 'input',
        name: 'subject',
        message: function(answers) {
          return (
            'Write a short, imperative tense description of the change (max ' +
            maxSummaryLength(options, answers) +
            ' chars):\n'
          );
        },
        default: options.defaultSubject,
        validate: function(subject, answers) {
          var filteredSubject = filterSubject(subject, options.disableSubjectLowerCase);
          return filteredSubject.length == 0
            ? 'subject is required'
            : filteredSubject.length <= maxSummaryLength(options, answers)
            ? true
            : 'Subject length must be less than or equal to ' +
              maxSummaryLength(options, answers) +
              ' characters. Current length is ' +
              filteredSubject.length +
              ' characters.';
        },
        transformer: function(subject, answers) {
          var filteredSubject = filterSubject(subject, options.disableSubjectLowerCase);
          var color =
            filteredSubject.length <= maxSummaryLength(options, answers)
              ? chalk.green
              : chalk.red;
          return color('(' + filteredSubject.length + ') ' + subject);
        },
        filter: function(subject) {
          return filterSubject(subject, options.disableSubjectLowerCase);
        }
      },
      {
        type: 'input',
        name: 'body',
        message: 'Provide a longer description of the change: (press enter to skip)\n',
        default: options.defaultBody
      },
      {
        type: 'confirm',
        name: 'isBreaking',
        message: 'Are there any breaking changes?',
        default: false
      },
      {
        type: 'input',
        name: 'breakingBody',
        default: '-',
        message:
          'A BREAKING CHANGE commit requires a body. Please enter a longer description of the commit itself:\n',
        when: function(answers) {
          return answers.isBreaking && !answers.body;
        },
        validate: function(breakingBody, answers) {
          return (
            breakingBody.trim().length > 0 ||
            'Body is required for BREAKING CHANGE'
          );
        }
      },
      {
        type: 'input',
        name: 'breaking',
        message: 'Describe the breaking changes:\n',
        when: function(answers) {
          return answers.isBreaking;
        }
      },

      {
        type: 'confirm',
        name: 'isIssueAffected',
        message: 'Does this change affect any open issues?',
        default: options.defaultIssues ? true : false
      },
      {
        type: 'input',
        name: 'issuesBody',
        default: '-',
        message:
          'If issues are closed, the commit requires a body. Please enter a longer description of the commit itself:\n',
        when: function(answers) {
          return (
            answers.isIssueAffected && !answers.body && !answers.breakingBody
          );
        }
      },
      {
        type: 'input',
        name: 'issues',
        message: 'Add issue references (e.g. "fix #123", "re #123".):\n',
        when: function(answers) {
          return answers.isIssueAffected;
        },
        default: options.defaultIssues ? options.defaultIssues : undefined
      }
    ]).then(function(answers) {
      var wrapOptions = {
        trim: true,
        cut: false,
        newline: '\n',
        indent: '',
        width: options.maxLineWidth
      };

      // parentheses are only needed when a scope is present
      var scope = answers.scope ? '(' + answers.scope + ')' : '';

      // Hard limit this line in the validate
      var head = answers.type + scope + ': ' + answers.subject;

      const affectsLine = makeAffectsLine(answers.scope);
      if (affectsLine) {
        answers.body = `${affectsLine}\n` + answers.body;
      }

      // Wrap these lines at options.maxLineWidth characters
      var body = answers.body ? wrap(answers.body, wrapOptions) : false;

      // Apply breaking change prefix, removing it if already present
      var breaking = answers.breaking ? answers.breaking.trim() : '';
      breaking = breaking
        ? 'BREAKING CHANGE: ' + breaking.replace(/^BREAKING CHANGE: /, '')
        : '';
      breaking = breaking ? wrap(breaking, wrapOptions) : false;

      var issues = answers.issues ? wrap(answers.issues, wrapOptions) : false;

      commit(filter([head, body, breaking, issues]).join('\n\n'));
    });
  }
};
