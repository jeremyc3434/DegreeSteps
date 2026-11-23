/* Release contracts for the full visual refresh. No browser, network, account
 * data, git history or ignored fixture is needed to run these checks in CI. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=__dirname,dist=path.join(root,'dist'),origin='https://degreesteps.com';
const retainedPages=[
  "about/index.html",
  "account.html",
  "admin.html",
  "audit.html",
  "blog/community-transfer-evidence/index.html",
  "blog/earn-credit-before-enrolling/index.html",
  "blog/graduate-acceleration-is-different/index.html",
  "blog/index.html",
  "blog/plan-subscriptions-before-paying/index.html",
  "blog/switching-majors-with-transfer-credit/index.html",
  "blog/what-a-75-percent-transfer-limit-means/index.html",
  "community.html",
  "compare-plans.html",
  "compare/index.html",
  "courses.html",
  "coverage.html",
  "credit-sources/actfl/index.html",
  "credit-sources/aleks/index.html",
  "credit-sources/asu-ulc/index.html",
  "credit-sources/christian-leaders/index.html",
  "credit-sources/clep/index.html",
  "credit-sources/coopersmith/index.html",
  "credit-sources/coursera-certificates/index.html",
  "credit-sources/cpa-credits/index.html",
  "credit-sources/csm/index.html",
  "credit-sources/davar/index.html",
  "credit-sources/dsst/index.html",
  "credit-sources/fema/index.html",
  "credit-sources/google-certificates/index.html",
  "credit-sources/index.html",
  "credit-sources/lawshelf/index.html",
  "credit-sources/microsoft-exams/index.html",
  "credit-sources/military-jst/index.html",
  "credit-sources/modern-states/index.html",
  "credit-sources/onlinedegree/index.html",
  "credit-sources/outlier/index.html",
  "credit-sources/portage/index.html",
  "credit-sources/saylor/index.html",
  "credit-sources/sophia/index.html",
  "credit-sources/straighterline/index.html",
  "credit-sources/study-com/index.html",
  "credit-sources/tecep/index.html",
  "credit-sources/teex/index.html",
  "credit-sources/tel/index.html",
  "credit-sources/total-testing/index.html",
  "credit-sources/uexcel/index.html",
  "credit-sources/upi-study/index.html",
  "credit-sources/westcott/index.html",
  "degree-audit.html",
  "faq/index.html",
  "guided.html",
  "guides/ace-nccrs-and-accreditation/index.html",
  "guides/compare-transfer-credit-sources/index.html",
  "guides/degree-audit-and-what-if/index.html",
  "guides/finish-faster-without-wasting-credit/index.html",
  "guides/how-transfer-credit-works/index.html",
  "guides/index.html",
  "guides/military-credit-jst-ccaf/index.html",
  "guides/organize-transcripts-and-credits/index.html",
  "guides/transfer-credit-for-campus-degrees/index.html",
  "how-it-works/index.html",
  "import-courses.html",
  "index.html",
  "library.html",
  "plan.html",
  "portal.html",
  "privacy/index.html",
  "programs.html",
  "request-plan.html",
  "resources/index.html",
  "school.html",
  "schools/charter-oak-state-college/index.html",
  "schools/east-texas-aandm-university/index.html",
  "schools/index.html",
  "schools/liberty-university/index.html",
  "schools/pierpont-community-and-technical-college/index.html",
  "schools/purdue-global/index.html",
  "schools/south-college/index.html",
  "schools/southern-new-hampshire-university/index.html",
  "schools/thomas-edison-state-university/index.html",
  "schools/university-of-maine-at-presque-isle/index.html",
  "schools/western-governors-university/index.html",
  "terms/index.html"
];
const workspaceContracts={
  "account.html": {
    "ids": [
      "account-main",
      "account-status",
      "account-error",
      "account-content"
    ],
    "fields": [],
    "scripts": [
      "audit-curriculum.js",
      "account-client.js",
      "account-return.js",
      "account.js",
      "app-shell.js",
      "workspace-access.js"
    ]
  },
  "admin.html": {
    "ids": [
      "admin-main",
      "admin-title",
      "admin-description",
      "admin-coverage-link",
      "admin-message",
      "admin-loading",
      "admin-ai-connection",
      "ai-connection-heading",
      "ai-connection-status",
      "ai-connection-summary",
      "ai-connection-message",
      "ai-storage-note",
      "ai-key-entry",
      "ai-key-summary",
      "ai-connection-form",
      "ai-api-key",
      "ai-key-help",
      "ai-connection-save",
      "ai-connection-test",
      "ai-connection-disconnect",
      "ai-connection-refresh",
      "ai-connection-limits",
      "ai-connection-details",
      "ai-connection-model",
      "admin-templates",
      "refresh-admin",
      "research-configuration",
      "admin-template-list",
      "admin-colleges",
      "college-create-form",
      "college-organizations",
      "college-workspace",
      "lead-organization",
      "refresh-leads",
      "college-lead-list",
      "admin-detail"
    ],
    "fields": [
      "apiKey",
      "name",
      "website"
    ],
    "scripts": [
      "account-client.js",
      "template-workspace-client.js",
      "admin.js",
      "app-shell.js"
    ]
  },
  "audit.html": {
    "ids": ["legacy-plan-handoff", "current-plan-link", "legacy-audit-redirect"],
    "fields": [],
    "scripts": []
  },
  "community.html": {
    "ids": [
      "nav-templates",
      "nav-community",
      "community-title",
      "community-signin",
      "new-community-plan",
      "community-app",
      "community-tab-templates",
      "community-tab-feed",
      "community-user-area",
      "community-toolbar",
      "community-status",
      "community-results",
      "community-featured",
      "community-feed",
      "community-empty",
      "community-detail",
      "publish-dialog",
      "close-publish",
      "publish-dialog-content",
      "thread-dialog",
      "close-thread",
      "thread-dialog-content"
    ],
    "fields": [],
    "scripts": [
      "account-return.js",
      "community-client.js",
      "verification.js",
      "program-catalog.js",
      "community-template-catalog.js",
      "community.js",
      "account-client.js",
      "app-shell.js"
    ]
  },
  "compare-plans.html": {
    "ids": [
      "comparison-app",
      "save-scenario-open",
      "comparison-status",
      "comparison-error",
      "comparison-intent",
      "comparison-intent-title",
      "comparison-intent-form",
      "comparison-goal",
      "comparison-level",
      "comparison-field",
      "comparison-modality",
      "comparison-advanced",
      "comparison-controls",
      "comparison-add",
      "compare-school",
      "compare-level",
      "compare-degree",
      "compare-slot",
      "compare-formats",
      "comparison-saved-versions",
      "comparison-priority-control",
      "compare-priority",
      "comparison-course-fit-note",
      "comparison-results",
      "comparison-courses",
      "comparison-library-info",
      "comparison-search",
      "comparison-filter",
      "comparison-candidate",
      "comparison-matrix",
      "comparison-coverage",
      "comparison-save",
      "comparison-save-form",
      "comparison-use",
      "comparison-use-content",
      "comparison-confirm-use"
    ],
    "fields": [
      "label"
    ],
    "scripts": [
      "planner.js",
      "guide-engine.js",
      "sheet-state.js",
      "journey-engine.js",
      "program-catalog.js",
      "audit-curriculum.js",
      "course-library-engine.js",
      "cost-engine.js",
      "savings-engine.js",
      "plan-comparison-engine.js",
      "account-client.js",
      "app-shell.js",
      "course-plan-view.js",
      "student-checklist.js",
      "comparison-runner.js",
      "compare-plans.js"
    ]
  },
  "courses.html": {
    "ids": [
      "courses-app",
      "courses-page-title",
      "courses-find-degrees",
      "courses-tab-all",
      "courses-tab-mine",
      "courses-saved-count",
      "courses-add-own",
      "course-search",
      "course-kind-field",
      "course-kind",
      "courses-filter-menu",
      "course-provider",
      "course-subject",
      "course-status-field",
      "course-status",
      "courses-results-count",
      "courses-clear-filters",
      "courses-status",
      "courses-error",
      "courses-results",
      "courses-more",
      "courses-coverage-summary",
      "courses-source-list",
      "course-details-dialog",
      "course-details-content",
      "course-status-dialog",
      "course-status-form",
      "course-status-title",
      "course-status-course",
      "course-status-progress",
      "course-status-source-note",
      "course-completion-date-field",
      "course-status-confirmation-field",
      "course-status-error",
      "course-status-review",
      "course-status-review-message",
      "course-status-current",
      "course-status-refresh",
      "course-status-unsaved",
      "course-status-unsaved-values",
      "course-status-save",
      "course-remove-dialog",
      "course-remove-title",
      "course-remove-name",
      "course-remove-confirm"
    ],
    "fields": [
      "provider",
      "code",
      "title",
      "credits",
      "creditSystem",
      "grade",
      "score",
      "completedOn",
      "clearEvaluations"
    ],
    "scripts": [
      "planner.js",
      "guide-engine.js",
      "sheet-state.js",
      "journey-engine.js",
      "course-library-engine.js",
      "account-client.js",
      "app-shell.js",
      "course-plan-view.js",
      "courses.js"
    ]
  },
  "coverage.html": {
    "ids": [
      "coverage-main",
      "coverage-refresh",
      "coverage-message",
      "coverage-gate",
      "coverage-gate-heading",
      "coverage-gate-copy",
      "coverage-sign-in",
      "coverage-retry",
      "coverage-workspace",
      "coverage-summary",
      "coverage-snapshot",
      "coverage-programs-heading",
      "coverage-program-count",
      "coverage-filter-form",
      "coverage-search",
      "coverage-school",
      "coverage-status",
      "coverage-program-status",
      "coverage-program-list",
      "coverage-more",
      "coverage-queue-heading",
      "coverage-queue-status",
      "coverage-queue-list",
      "coverage-queue-retry",
      "coverage-detail"
    ],
    "fields": [
      "q",
      "school",
      "status"
    ],
    "scripts": [
      "account-client.js",
      "template-workspace-client.js",
      "coverage.js"
    ]
  },
  "degree-audit.html": {
    "ids": [
      "audit-app",
      "audit-message",
      "audit-directory-status",
      "audit-start",
      "audit-import-form",
      "audit-row-count",
      "audit-editor-rows",
      "audit-add-row",
      "audit-paste",
      "audit-template",
      "audit-file",
      "audit-csv",
      "audit-import-rows",
      "audit-import-status",
      "audit-save",
      "audit-save-status",
      "audit-review",
      "audit-degree-summary",
      "audit-back",
      "audit-preview-rows",
      "audit-total",
      "audit-confirm",
      "audit-build"
    ],
    "fields": [
      "programId",
      "school",
      "title",
      "level",
      "modality",
      "totalCredits",
      "creditSystem",
      "sourceUrl",
      "catalog",
      "institutionMinCredits",
      "upperMinCredits"
    ],
    "scripts": [
      "planner.js",
      "guide-engine.js",
      "sheet-state.js",
      "program-catalog.js",
      "audit-curriculum.js",
      "degree-audit.js"
    ]
  },
  "guided.html": {
    "ids": ["legacy-guided-handoff", "guided-quiz-link", "legacy-guided-redirect"],
    "fields": [],
    "scripts": []
  },
  "import-courses.html": {
    "ids": [
      "import-app",
      "step-upload",
      "step-review",
      "step-done",
      "import-status",
      "import-error",
      "import-start",
      "import-dropzone",
      "import-files",
      "import-files-panel",
      "import-add-files",
      "import-file-list",
      "import-cancel",
      "import-review",
      "import-review-title",
      "import-review-count",
      "import-select-valid",
      "import-skip-conflicts",
      "batch-provider",
      "batch-units",
      "batch-status",
      "import-fill-missing",
      "import-attention-only",
      "import-rows",
      "import-selection-count",
      "import-apply",
      "import-success",
      "import-success-title",
      "import-success-message",
      "import-next",
      "import-start-over",
      "import-column-guide",
      "import-template-help"
    ],
    "fields": [],
    "scripts": [
      "guide-engine.js",
      "sheet-state.js",
      "course-library-engine.js",
      "account-client.js",
      "app-shell.js",
      "record-import-engine.js",
      "course-import-workflow.js",
      "record-file-reader.js",
      "credit-import.js",
      "import-courses.js"
    ]
  },
  "library.html": {
    "ids": [
      "explore",
      "search",
      "level",
      "format",
      "sort",
      "count",
      "cards",
      "compare",
      "workspace",
      "destination",
      "goal",
      "required",
      "units",
      "creditform",
      "course",
      "source",
      "credits",
      "status",
      "inventory",
      "import",
      "priority",
      "rate",
      "fees",
      "pace",
      "planned",
      "summary",
      "tasks",
      "notes",
      "export",
      "print",
      "clear",
      "message",
      "learn"
    ],
    "fields": [],
    "scripts": [
      "account-client.js",
      "app-shell.js",
      "library.js"
    ]
  },
  "plan.html": {
    "ids": [
      "sheet-app",
      "sheet-status",
      "sheet-loading",
      "sheet-error",
      "sheet-workspace",
      "sheet-titlebar",
      "sheet-route",
      "sheet-summary",
      "sheet-savings",
      "sheet-next",
      "sheet-controls",
      "sheet-review-note",
      "sheet-toolbar",
      "sheet-scroll-help",
      "sheet-grid",
      "sheet-task-panel",
      "sheet-home",
      "sheet-footer",
      "sheet-context",
      "sheet-momentum",
      "sheet-dialog",
      "close-sheet-dialog",
      "sheet-dialog-savings",
      "sheet-dialog-content"
    ],
    "fields": [],
    "scripts": [
      "planner.js",
      "guide-engine.js",
      "account-return.js",
      "community-client.js",
      "verification.js",
      "sheet-state.js",
      "journey-engine.js",
      "program-catalog.js",
      "audit-curriculum.js",
      "program-opportunities.js",
      "cost-engine.js",
      "savings-engine.js",
      "plan-comparison-engine.js",
      "savings-tracker.js",
      "credit-import.js",
      "student-progress.js",
      "plan-home.js",
      "course-plan-view.js",
      "plan-route.js",
      "student-checklist.js",
      "student-checklist-view.js",
      "cost-assumptions.js",
      "sheet.js",
      "account-client.js",
      "app-shell.js"
    ]
  },
  "portal.html": {
    "ids": [
      "portal-home-link",
      "portal-account-link",
      "portal-app",
      "portal-notice",
      "portal-loading",
      "portal-error",
      "portal-savings",
      "portal-content",
      "portal-saved"
    ],
    "fields": [],
    "scripts": [
      "planner.js",
      "guide-engine.js",
      "sheet-state.js",
      "journey-engine.js",
      "program-catalog.js",
      "audit-curriculum.js",
      "program-opportunities.js",
      "cost-engine.js",
      "savings-engine.js",
      "savings-tracker.js",
      "account-return.js",
      "community-client.js",
      "account-client.js",
      "student-progress.js",
      "plan-home.js",
      "course-plan-view.js",
      "plan-comparison-engine.js",
      "comparison-runner.js",
      "portal.js",
      "app-shell.js"
    ]
  },
  "programs.html": {
    "ids": [
      "program-app",
      "program-filters",
      "program-search",
      "program-school",
      "program-level",
      "program-credit",
      "program-count",
      "program-error",
      "program-college-tip",
      "program-results",
      "program-more",
      "program-coverage",
      "program-dialog",
      "program-dialog-close",
      "program-dialog-content"
    ],
    "fields": [],
    "scripts": [
      "program-catalog.js",
      "program-opportunities.js",
      "account-client.js",
      "programs.js",
      "app-shell.js"
    ]
  },
  "request-plan.html": {
    "ids": [
      "request-main",
      "request-intro",
      "request-entry",
      "degree-request-form",
      "request-heading",
      "degree-url",
      "request-submit",
      "degree-url-help",
      "request-account-note",
      "request-message",
      "request-progress",
      "research-stage-label",
      "research-stage-detail",
      "research-progress-counts",
      "research-elapsed",
      "request-result",
      "request-history-panel",
      "request-history-count",
      "requests-heading",
      "refresh-requests",
      "request-history",
      "request-alternatives"
    ],
    "fields": [
      "url"
    ],
    "scripts": [
      "sheet-state.js",
      "program-catalog.js",
      "audit-curriculum.js",
      "planner.js",
      "account-client.js",
      "template-workspace-client.js",
      "request-plan.js",
      "app-shell.js"
    ]
  },
  "school.html": {
    "ids": [
      "school-app",
      "school-status",
      "school-content"
    ],
    "fields": [],
    "scripts": [
      "program-catalog.js",
      "community-template-catalog.js",
      "school-insights-engine.js",
      "account-return.js",
      "community-client.js",
      "school.js",
      "account-client.js",
      "app-shell.js"
    ]
  }
};
const searchContracts={
  "about/index.html": "472f9cbe1e54e528fd198313e2e115dee6616732d5b7010eb09c2d683eb94d2f",
  "blog/community-transfer-evidence/index.html": "61aa2f758ab1ff9adfd77383b6704b306d06cb6e45883778d9e997188741d503",
  "blog/earn-credit-before-enrolling/index.html": "8df99b7d15921e714c8e490482047ad33a121885a87c87604579e9b9f6802ed0",
  "blog/graduate-acceleration-is-different/index.html": "df889c772fd899303371e61101fecfa0dcdd58b068f6aa1787b1ebadee75c79a",
  "blog/index.html": "5de55aae2cd2e2cd838f0f0d45dcc99ccc700e2022b04b6607f7d95bda12f1c4",
  "blog/plan-subscriptions-before-paying/index.html": "46b4755c2cdc0aba6bf7376357a6d89f79d650fe388fc1f58c787b410bfc01a8",
  "blog/switching-majors-with-transfer-credit/index.html": "1df1e114369154bdc2af043bf5dba6cc92ce5cd13e774dd1b2432aab90111a53",
  "blog/what-a-75-percent-transfer-limit-means/index.html": "b1d85cf43b60eacc37b1ae8f5b1351f5e71154fb29e8bbf29746b7f6c9895cb9",
  "compare/index.html": "f969b14adc2dff46cd1f6da2bd7cca4933df8199bbeb27073919e456caa1c7b3",
  "credit-sources/actfl/index.html": "049b4f2e0fafc01c4246a77d470c4e76f7af6fa1b82ca8480092b594004dd513",
  "credit-sources/aleks/index.html": "970a932c70c2964ca3850cf8fe20939b6caa1f7b142812a7a890dcde01ba998e",
  "credit-sources/asu-ulc/index.html": "cbb927f8ac95c195d255a3b580ce9f92eaa57b231c105ec2c8a0867c5db61c23",
  "credit-sources/christian-leaders/index.html": "16ace115c2b380cb88521c8dd94a516436d7575123b8f11b323e0c41ec7c91b6",
  "credit-sources/clep/index.html": "609e2f3a267139a58cc1b738c9001093fa757f7a55b9a1e07ab9f9150a188faf",
  "credit-sources/coopersmith/index.html": "e7918a12104ad692c389a6f167e48c025667c473093af3c3e809646dd87f4b85",
  "credit-sources/coursera-certificates/index.html": "848c4eb0087cdb50a75e46dbf39cf111ce6d87cf8d1b4f38837b6c6565831e03",
  "credit-sources/cpa-credits/index.html": "0bd26d6b6e80d261de71f47d2816a505a758310d2a097b84c6e9b067be99c54b",
  "credit-sources/csm/index.html": "163fe1efe4cc9bfe914e76d0600acaa1be4f60916c6ee99aec22bf51d5fa370a",
  "credit-sources/davar/index.html": "3f34d11467aa77dec8d3a9b9f5ef02c90a6b8883543c820b8045b393409b2c56",
  "credit-sources/dsst/index.html": "decee36ea67a0e72119f9c61e3f79c7b10422d10c134633b5c993c43081eac8b",
  "credit-sources/fema/index.html": "3766e84678be646303b70ad162f61425fcd0688b06fb741926d43e26ac888dcc",
  "credit-sources/google-certificates/index.html": "748c04e0ec3747be1c34dbddb569be4d31a29beeccc1256300ad57bb46b503f1",
  "credit-sources/index.html": "b6480143855bb4cfd894836c25ab502eb9d1d4e08ffc7e881c9557c849a01040",
  "credit-sources/lawshelf/index.html": "f5724427bf4c335f79bd92e724fe708784260a0c0481410501450d303d105f5c",
  "credit-sources/microsoft-exams/index.html": "8fec47595e4c5a8af2eb84eb704006029687e73408a4018f46ef7067681da749",
  "credit-sources/military-jst/index.html": "00fd7149521b7847930a557dc10e64e2b75f3f4f8f9016a3feda7df80f67f6a4",
  "credit-sources/modern-states/index.html": "d5590d79b97739e69ca0de36bf5418a176921ec9dcba404602c912d11d78dcc7",
  "credit-sources/onlinedegree/index.html": "760a7302a0053033d60df4d23f97322283868d1f1dae7961f77dcdd682988ed4",
  "credit-sources/outlier/index.html": "50721a93b6f8233a292a748a4a0055a22fd6a48d83d13241f295f6cf466ee8ae",
  "credit-sources/portage/index.html": "97165c55200601379fb47f8d15814a7b42b4662d596120ddd1095001bfd27dd5",
  "credit-sources/saylor/index.html": "f45505f2946cad6d352cdbcee2a4c9043dc1211cb3cabfbd6cf6d94f5bf4d9c3",
  "credit-sources/sophia/index.html": "4e6fb66ec9dacd49f631730f9f23c7aeb0fd50dfe73f985e7691a7cb4976d600",
  "credit-sources/straighterline/index.html": "62fa2b5338544d3e59044a5820c9bdc7293271c57df01fc6c7647b2f154acdb7",
  "credit-sources/study-com/index.html": "bebe574796e0cb922aa82a19db039ac5017df3926af55d477116d3cfd0de7f04",
  "credit-sources/tecep/index.html": "124f32629982631efbe74d39098cc6ce6ed6049305e25944390cacc915155d9f",
  "credit-sources/teex/index.html": "2d3b92572cf62dac26956ed63d5d91a50fd57bafc2c25df6847137fd25d1b7f4",
  "credit-sources/tel/index.html": "a214837828551402dc56009bd7d0f442aa4337969b6ad7cf81f5e1e2c6ae902d",
  "credit-sources/total-testing/index.html": "2369def6144b8bdb57de07a3824915ed61eb64925ba00f49c775968dc6e897dc",
  "credit-sources/uexcel/index.html": "6500a3551d7a0a06ab0b108e3a9268e3ff7679c55b907f5e70928150ac1012f7",
  "credit-sources/upi-study/index.html": "65d3ae2460d209a198ff8a493934c7bc4fdd5e05a5a63b0c81ed4f39a1f46701",
  "credit-sources/westcott/index.html": "5ad6ca27a924e33ff0e4167a4c3c3ec12d721acf65925b2bbf063653587afca2",
  "faq/index.html": "3afe6b8c242051d37d382d698972ae0ea888f2b2f3cb38100817e74d80fc12e7",
  "guides/ace-nccrs-and-accreditation/index.html": "1790b36ad21bd35fa8f39a642239e0f9c5714eb7d21be079d085a144578bf27c",
  "guides/compare-transfer-credit-sources/index.html": "90d3e032a55b91ec258f7e45ba5d087d560de31b40df926d3c58803955a3c999",
  "guides/degree-audit-and-what-if/index.html": "31de6a5c93a604992a141e4078a164db1a20670dc45c44aec0b1e5d8079e4e3c",
  "guides/finish-faster-without-wasting-credit/index.html": "384001fc6c741d3674c2e769005103ec397fb8698fcb4206d0da243d366e9f75",
  "guides/how-transfer-credit-works/index.html": "ee9a6687ecde4c5c281c3e60e2100b5ad13c9f488eb20e5884eb09065cf799dd",
  "guides/index.html": "8d2895d79a8b5770d24439c425cb72d8b229cdba6538a6c33d8cc73db0a246b5",
  "guides/military-credit-jst-ccaf/index.html": "e5d6d031d92236222e949fd030e47ca03825332bfb871d2c2415b97cdd5520c8",
  "guides/organize-transcripts-and-credits/index.html": "cce5fe53f23ad871780d9ee08223559fdf094a4fa08e7ef156e804736ae01c10",
  "guides/transfer-credit-for-campus-degrees/index.html": "459c6a26af3a1b5e5dd6cf3c7c8e88702e769fd427de2944eab1cbb3da4cbf1c",
  "how-it-works/index.html": "edd7a9f2f104e5fb46c2eec11bb29455b9ee60f5fac3b037f69f012cd05f5a15",
  "index.html": "1ed8a43655fb2fd14321a31c4bbe42e75225766d0c7b66b7fc8aaecc532cd550",
  "privacy/index.html": "bf9491a1d3514116fd7f07be2520163bde1a9521fb2309e0abde2dc0ada723ca",
  "programs.html": "6fba890a79854643b49e71b6c97c930a0602a9f8d7de5979342e3b54212328fc",
  "resources/index.html": "ee01225148edba59fc3e9d8d9bfc4f732232001bd1a17158f0729f7e3006a155",
  "schools/charter-oak-state-college/index.html": "552d70fbce67c607b7324a2c3000d42d79c37e0e2fdf66cd4280f5aaed35cc23",
  "schools/east-texas-aandm-university/index.html": "753991ac0cddb9e2e07da4c68f823d8c254deab3c8a380e7d18ede0398f6e06f",
  "schools/index.html": "4b5882b442fa50398c61a6c065fa185b679a8357e728c1c57a9389a08701bf28",
  "schools/liberty-university/index.html": "426ec5806b5468ba84fdfa25721512e8d4bc81edcfd7c9157cb69c293034f6a1",
  "schools/pierpont-community-and-technical-college/index.html": "6c6d3c80fc694d7b8e2b99c7eb210f6de63a219b2afff596a496f7508753ce05",
  "schools/purdue-global/index.html": "ed559f64dccf225d200839aa6dd1678789ddca8151a0cde3be3fccebdb1cd41f",
  "schools/south-college/index.html": "cb55d0460298150cddc5540f0205cf470122a85250185cac13999681f33f5b15",
  "schools/southern-new-hampshire-university/index.html": "3c3572d6f7b42c672060df0124b899c3a18ebaff324fd16a5937e17c55999271",
  "schools/thomas-edison-state-university/index.html": "a53ec021356ee85e4a1185f610b4ce99527eb5d69ac18ed35309bbf9061dc775",
  "schools/university-of-maine-at-presque-isle/index.html": "d10f29a3ebea86b6e3e3b300d4e0589b4f076082b42fd46ac96f73f2a5108ace",
  "schools/western-governors-university/index.html": "634b1a2569fb623da581148c8ddefd4c4c3ef0ddfeb045563e86dfba3704039b",
  "terms/index.html": "9cf7f6a3f2ba721abe02b0953d990a84893b1b6aa95a680d85ac80bed311f20d"
};
const privatePages=[
  "account.html",
  "admin.html",
  "audit.html",
  "compare-plans.html",
  "courses.html",
  "coverage.html",
  "degree-audit.html",
  "guided.html",
  "import-courses.html",
  "plan.html",
  "portal.html",
  "request-plan.html"
];
const costHooks={
  "index.html": [
    "data-cost-after",
    "data-cost-after-label",
    "data-cost-after-outside-bar",
    "data-cost-after-terms",
    "data-cost-after-university-bar",
    "data-cost-before",
    "data-cost-before-bar",
    "data-cost-before-label",
    "data-cost-before-terms",
    "data-cost-budget",
    "data-cost-card-after",
    "data-cost-card-before",
    "data-cost-card-savings",
    "data-cost-card-scenario",
    "data-cost-comparison",
    "data-cost-entry",
    "data-cost-error",
    "data-cost-facts",
    "data-cost-fees",
    "data-cost-fields",
    "data-cost-pace",
    "data-cost-pace-field",
    "data-cost-pace-label",
    "data-cost-pace-note",
    "data-cost-percent",
    "data-cost-policy",
    "data-cost-program",
    "data-cost-savings",
    "data-cost-savings-label",
    "data-cost-scenario",
    "data-cost-school",
    "data-cost-sources",
    "data-cost-speed",
    "data-cost-time-note",
    "data-cost-timing",
    "data-cost-transfer",
    "data-cost-transfer-label"
  ],
  "compare/index.html": [
    "data-cost-after",
    "data-cost-after-label",
    "data-cost-after-outside-bar",
    "data-cost-after-terms",
    "data-cost-after-university-bar",
    "data-cost-before",
    "data-cost-before-bar",
    "data-cost-before-label",
    "data-cost-before-terms",
    "data-cost-budget",
    "data-cost-comparison",
    "data-cost-error",
    "data-cost-facts",
    "data-cost-fees",
    "data-cost-fields",
    "data-cost-pace",
    "data-cost-pace-field",
    "data-cost-pace-label",
    "data-cost-pace-note",
    "data-cost-percent",
    "data-cost-policy",
    "data-cost-program",
    "data-cost-row-after",
    "data-cost-row-before",
    "data-cost-row-savings",
    "data-cost-row-timing",
    "data-cost-row-transfer",
    "data-cost-savings",
    "data-cost-savings-label",
    "data-cost-scenario",
    "data-cost-school",
    "data-cost-sources",
    "data-cost-speed",
    "data-cost-table-entry",
    "data-cost-time-note",
    "data-cost-timing",
    "data-cost-transfer",
    "data-cost-transfer-label"
  ]
};
const robotsProtectedPages=[
  "account.html",
  "admin.html",
  "audit.html",
  "coverage.html",
  "guided.html",
  "plan.html",
  "portal.html",
  "request-plan.html"
];
const costSchools=[
  "liberty-residential",
  "liberty-online",
  "snhu-online",
  "tesu-standard",
  "charter-oak",
  "umpi-yourpace",
  "wgu-project-management"
];
const familyPages={
 'discovery-design.css':['portal.html','programs.html','request-plan.html','guided.html','audit.html','degree-audit.html','school.html'],
 'collection-design.css':['courses.html','import-courses.html'],
 'comparison-design.css':['compare-plans.html'],
 'community-design.css':['community.html'],
 'settings-design.css':['account.html','admin.html','coverage.html']
};
const read=name=>fs.readFileSync(path.join(dist,name),'utf8');
const decode=value=>String(value).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&(amp|quot|apos|lt|gt|nbsp);/g,(_,name)=>({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '})[name]);
const normalized=value=>decode(value).replace(/\s+/g,' ').trim();
const text=html=>normalized(html.replace(/<!--[^]*?-->/g,' ').replace(/<(script|style)\b[^>]*>[^]*?<\/\1>/gi,' ').replace(/<[^>]*>/g,' '));
function tags(html){
 const clean=html.replace(/<!--[^]*?-->/g,'').replace(/(<script\b[^>]*>)[^]*?<\/script>/gi,'$1</script>').replace(/(<style\b[^>]*>)[^]*?<\/style>/gi,'$1</style>');
 return [...clean.matchAll(/<([a-z][\w:-]*)\b((?:"[^"]*"|'[^']*'|[^'">])*)>/gi)].map(match=>{
  const attributes={};
  for(const attr of match[2].matchAll(/([^\s=<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g))attributes[attr[1].toLowerCase()]=decode(attr[2]??attr[3]??attr[4]??'');
  return {name:match[1].toLowerCase(),attributes};
 });
}
const walk=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(directory,entry.name)):[path.join(directory,entry.name)]);
const htmlFiles=walk(dist).filter(file=>file.endsWith('.html')).map(file=>path.relative(dist,file).replaceAll(path.sep,'/')).sort();
const documents=new Map(htmlFiles.map(file=>{const html=read(file);return[file,{html,tags:tags(html)}];}));
const documentURL=file=>new URL('/'+file.replace(/index\.html$/,''),origin);
const localPath=(file,reference)=>new URL(reference,documentURL(file)).pathname;
const styles=(file,doc)=>doc.tags.filter(tag=>tag.name==='link'&&tag.attributes.rel?.toLowerCase()==='stylesheet').map(tag=>localPath(file,tag.attributes.href));
const scripts=(file,doc)=>doc.tags.filter(tag=>tag.name==='script'&&tag.attributes.src).map(tag=>localPath(file,tag.attributes.src));
const bodyClasses=doc=>new Set((doc.tags.find(tag=>tag.name==='body')?.attributes.class||'').split(/\s+/));
const metadata=(doc,key,kind='name')=>doc.tags.find(tag=>tag.name==='meta'&&tag.attributes[kind]===key)?.attributes.content||'';
const canonical=doc=>doc.tags.find(tag=>tag.name==='link'&&tag.attributes.rel==='canonical')?.attributes.href||'';
const searchFingerprint=doc=>crypto.createHash('sha256').update(JSON.stringify({canonical:canonical(doc),title:normalized(doc.html.match(/<title\b[^>]*>([^]*?)<\/title>/i)?.[1]||''),description:normalized(metadata(doc,'description'))})).digest('hex');
function fileForURL(url){
 const pathname=decodeURIComponent(url.pathname);assert(!pathname.includes('\0'));
 const resolved=path.resolve(dist,'.'+pathname);assert(resolved===dist||resolved.startsWith(dist+path.sep),'Local asset cannot escape the static root');
 const candidates=pathname.endsWith('/')?[path.join(resolved,'index.html')]:[resolved,path.join(resolved,'index.html')];
 return candidates.find(file=>fs.existsSync(file)&&fs.statSync(file).isFile());
}

test('the redesign covers every retained page and assigns its shared and task-specific design',()=>{
 for(const file of retainedPages)assert(documents.has(file),file+' must not disappear during a redesign');
 assert(htmlFiles.length>=83,'The complete public and workspace website remains published');
 for(const [file,doc]of documents){
  const css=styles(file,doc);assert.equal(css.filter(href=>href==='/brand.css').length,1,file+' has one brand foundation');
  assert.equal(css.filter(href=>href==='/experience.css').length,1,file+' has one shared experience foundation');
  assert(css.indexOf('/experience.css')>css.indexOf('/brand.css'),file+' loads shared experience after brand tokens');
  if(bodyClasses(doc).has('public-page'))assert.equal(css.filter(href=>href==='/public-design.css').length,1,file+' uses the public reading and discovery design');
 }
 for(const [family,files]of Object.entries(familyPages))for(const file of files){const css=styles(file,documents.get(file));assert(css.includes('/workspace-design.css'),file+' retains shared workspace navigation styling');assert.equal(css.filter(href=>href==='/'+family).length,1,file+' gets the appropriate task layout');assert(css.indexOf('/'+family)>css.indexOf('/workspace-design.css'),file+' can adapt shared workspace styling to its task');}
 const planCSS=styles('plan.html',documents.get('plan.html'));assert.equal(planCSS.at(-1),'/plan-design.css','The approved complete plan keeps its specialized design after shared styles');
});

test('every static stylesheet, script, image and downloadable template resolves locally',()=>{
 for(const [file,doc]of documents)for(const tag of doc.tags){
  const raw=tag.name==='script'||tag.name==='img'||tag.name==='source'?tag.attributes.src:tag.name==='link'&&tag.attributes.rel==='stylesheet'?tag.attributes.href:tag.name==='a'&&Object.hasOwn(tag.attributes,'download')?tag.attributes.href:null;
  if(raw&&!/^(?:data:|blob:)/i.test(raw)){const url=new URL(raw,documentURL(file));if(url.origin===origin)assert(fileForURL(url),file+' references a missing static asset: '+raw);}
  if(['img','source'].includes(tag.name)&&tag.attributes.srcset)for(const candidate of tag.attributes.srcset.split(',')){const reference=candidate.trim().split(/\s+/)[0];if(!reference||reference.startsWith('data:'))continue;const url=new URL(reference,documentURL(file));if(url.origin===origin)assert(fileForURL(url),file+' references a missing responsive image: '+reference);}
 }
});

test('page IDs remain unique and workspace controls, form fields and script order stay wired',()=>{
 for(const [file,doc]of documents){const ids=doc.tags.map(tag=>tag.attributes.id).filter(Boolean);assert.equal(new Set(ids).size,ids.length,file+' must not duplicate a live control ID');}
 for(const [file,contract]of Object.entries(workspaceContracts)){
  const doc=documents.get(file),ids=new Set(doc.tags.map(tag=>tag.attributes.id).filter(Boolean));
  for(const id of contract.ids)assert(ids.has(id),file+' lost existing control '+id);
  const fields=doc.tags.filter(tag=>['input','select','textarea','button'].includes(tag.name)&&tag.attributes.name).map(tag=>tag.attributes.name);
  for(const name of new Set(contract.fields))assert(fields.includes(name),file+' lost original form field '+name);
  const loaded=scripts(file,doc);let previous=-1;
  for(const required of contract.scripts){const index=loaded.indexOf('/'+required);assert(index>previous,file+' must retain dependency order for '+required);previous=index;}
 }
});

test('imports retain batch file support and templates while secret entry remains masked',()=>{
 const doc=documents.get('import-courses.html'),upload=doc.tags.find(tag=>tag.attributes.id==='import-files');assert(upload&&upload.name==='input');assert.equal(upload.attributes.type,'file');assert(Object.hasOwn(upload.attributes,'multiple'),'Students can still import several records at once');
 for(const extension of ['.pdf','.xlsx','.csv','.tsv','.txt'])assert(upload.attributes.accept.split(',').includes(extension),'Original upload type remains supported: '+extension);
 const templates=doc.tags.filter(tag=>tag.name==='a'&&Object.hasOwn(tag.attributes,'download')).map(tag=>localPath('import-courses.html',tag.attributes.href));
 for(const filename of ['/data/credit-import-template.csv','/data/credit-import-template.xlsx'])assert(templates.includes(filename),'Downloadable course template remains accessible without JavaScript');
 const key=documents.get('admin.html').tags.find(tag=>tag.attributes.id==='ai-api-key');assert.equal(key.attributes.type,'password');assert.equal(key.attributes.autocomplete,'off');assert(!key.attributes.value,'The visual redesign cannot seed an API key into HTML');
 const courseFields=documents.get('courses.html').tags.filter(tag=>['input','select'].includes(tag.name));
 for(const name of ['credits','creditSystem','completedOn'])assert(!Object.hasOwn(courseFields.find(tag=>tag.attributes.name===name).attributes,'required'),name+' may remain unknown in a provisional original record');
});

test('both public cost calculators retain their controls, output hooks and complete school choices',()=>{
 for(const file of ['index.html','compare/index.html']){
  const doc=documents.get(file);
  for(const hook of costHooks[file])assert(doc.tags.some(tag=>Object.hasOwn(tag.attributes,hook)),file+' lost calculator hook '+hook);
  const schoolSelect=doc.html.match(/<select\b[^>]*data-cost-school[^>]*>([^]*?)<\/select>/i)?.[1];assert(schoolSelect,file+' has a school selector');
  const values=tags(schoolSelect).filter(tag=>tag.name==='option').map(tag=>tag.attributes.value);
  for(const value of costSchools)assert(values.includes(value),file+' lost existing college scenario '+value);
  for(const source of ['cost-engine.js','cost-comparison.js'])assert(scripts(file,doc).includes('/'+source),file+' retains the real calculator rather than a decorative replacement');
 }
});

test('every guide and article keeps its complete source content, navigable sections and citations',()=>{
 const content=JSON.parse(fs.readFileSync(path.join(root,'content/public-content.json'),'utf8'));
 for(const article of content.articles){
  const file=(article.type==='guide'?'guides/':'blog/')+article.slug+'/index.html',doc=documents.get(file);assert(doc,file+' remains published');const visible=text(doc.html),ids=new Set(doc.tags.map(tag=>tag.attributes.id).filter(Boolean));
  assert(visible.includes(normalized(article.title)),file+' retains its real article title');
  article.sections.forEach((section,index)=>{
   assert(ids.has('section-'+(index+1)),file+' keeps section anchors');assert(doc.tags.some(tag=>tag.name==='a'&&tag.attributes.href==='#section-'+(index+1)),file+' keeps its table-of-contents link');
   for(const paragraph of section.paragraphs||[])assert(visible.includes(normalized(paragraph)),file+' lost substantive guidance: '+paragraph.slice(0,90));
   for(const bullet of section.bullets||[])assert(visible.includes(normalized(bullet)),file+' lost substantive guidance: '+bullet.slice(0,90));
  });
  for(const source of article.sources||[])assert(doc.tags.some(tag=>tag.name==='a'&&tag.attributes.href===source.url),file+' retains citation '+source.url);
  for(const related of article.related||[]){const next=content.articles.find(item=>item.slug===related);assert(next);const href='/'+(next.type==='guide'?'guides/':'blog/')+next.slug+'/';assert(doc.tags.some(tag=>tag.name==='a'&&tag.attributes.href===href),file+' retains related guide '+related);}
 }
});

test('existing public search identities and private search boundaries survive the redesign',()=>{
 const sitemap=read('sitemap.xml'),sitemapURLs=[...sitemap.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].map(match=>decode(match[1]).trim()),robots=read('robots.txt');
 for(const [file,fingerprint]of Object.entries(searchContracts)){const doc=documents.get(file);assert.equal(searchFingerprint(doc),fingerprint,file+' changed its canonical, page title or search description');assert(sitemapURLs.includes(canonical(doc)),file+' keeps its discoverable public route');}
 for(const file of privatePages){const doc=documents.get(file);assert(/noindex/i.test(metadata(doc,'robots')),file+' stays out of search');assert(!sitemapURLs.some(value=>new URL(value).pathname==='/'+file),file+' cannot enter the public sitemap');if(robotsProtectedPages.includes(file))assert(robots.includes('Disallow: /'+file),file+' keeps its existing robots boundary');}
 for(const [file,doc]of documents)for(const script of doc.html.matchAll(/<script\b([^>]*)>([^]*?)<\/script>/gi)){
  if(!/\btype=["']application\/ld\+json["']/i.test(script[1]))continue;
  const visit=value=>{if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object'){assert(!Object.hasOwn(value,'aggregateRating'),file+' cannot gain invented public review scores');Object.values(value).forEach(visit);}};
  visit(JSON.parse(script[2]));
 }
});
