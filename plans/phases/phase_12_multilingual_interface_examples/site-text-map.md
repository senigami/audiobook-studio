# Site Text Map

Representative current site strings, grouped by surface. These are the strings that should
be split into locale keys during implementation.

## 1. Shell

| Current text | Proposed key | Split note |
| --- | --- | --- |
| Audiobook Studio | `shell.brand.title` | keep as a single brand label |
| Library | `shell.nav.library` | route label |
| Voices | `shell.nav.voices` | route label |
| Activity | `shell.nav.activity` | route label |
| Engines | `shell.nav.engines` | route label |
| Integrations | `shell.nav.integrations` | route label |
| Settings | `shell.nav.settings` | route label |
| Connected | `shell.connection.connected` | status chip |
| Queue | `shell.queue.button` | route/action label |
| Dark mode | `shell.theme.dark` | toggle label |
| Light mode | `shell.theme.light` | toggle label |
| System | `shell.theme.system` | toggle label |
| Collapse rail | `shell.rail.collapse` | icon tooltip / aria |
| Expand rail | `shell.rail.expand` | icon tooltip / aria |

## 2. Library

| Current text | Proposed key | Split note |
| --- | --- | --- |
| Good evening, Steven | `library.hero.greeting` | split greeting and user name |
| Continue | `library.section.continue` | section label |
| All Books | `library.section.allBooks` | section label |
| Recent | `library.sort.recent` | sort chip |
| A-Z | `library.sort.alpha` | sort chip |
| In Progress | `library.filter.inProgress` | filter chip |
| New Book | `common.actions.newBook` | shared primary action |
| View Docs | `common.actions.viewDocs` | shared secondary action |
| Studio | `library.status.studio` | project status chip |
| Review | `library.status.review` | project status chip |
| Drafting | `library.status.drafting` | project status chip |
| Published | `library.status.published` | project status chip |

## 3. Book Shell and Stages

| Current text | Proposed key | Split note |
| --- | --- | --- |
| Runtime | `book.identity.runtime` | label only; duration is formatted at runtime |
| Predicted | `book.identity.predictedRuntime` | label only; duration is formatted at runtime |
| Manuscript | `book.stage.manuscript` | stage tab |
| Casting | `book.stage.casting` | stage tab |
| Studio | `book.stage.studio` | stage tab |
| Review | `book.stage.review` | stage tab |
| Publish | `book.stage.publish` | stage tab |
| Focus | `book.actions.focus` | book-stage action |
| New chapter | `common.actions.newChapter` | shared primary action; leading plus is icon chrome, not translated text |
| Sort A-Z | `book.actions.sortAlpha` | sort control |
| Edit text | `common.actions.editText` | shared action |

## 4. Manuscript

| Current text | Proposed key | Split note |
| --- | --- | --- |
| Chapters | `book.manuscript.table.chapters` | table header |
| Title | `book.manuscript.table.title` | table header |
| Words | `book.manuscript.table.words` | table header |
| Stage | `book.manuscript.table.stage` | table header |
| Analysis | `book.manuscript.analysis.label` | strip label |
| Chars | `book.manuscript.analysis.chars` | metric label |
| Sentences | `book.manuscript.analysis.sentences` | metric label |
| Segments | `book.manuscript.analysis.segments` | metric label |
| Est. Gen. | `book.manuscript.analysis.estimatedGeneration` | metric label |
| Import manuscript file | `book.manuscript.import.title` | panel title |
| .txt, .docx, or .epub | `book.manuscript.import.help` | helper copy |
| Choose file | `common.actions.chooseFile` | shared action |

## 5. Casting

| Current text | Proposed key | Split note |
| --- | --- | --- |
| Narrator (default) | `book.casting.narratorDefault` | pinned default row |
| Characters | `book.casting.characters` | roster label |
| Voice | `book.casting.voice` | column / label |
| Color | `book.casting.color` | column / label |
| Delete | `common.actions.delete` | shared action |

## 6. Activity and Queue

| Current text | Proposed key | Split note |
| --- | --- | --- |
| Activity | `activity.page.title` | page heading |
| Queue | `activity.queue.title` | drawer/page label |
| Pause all | `activity.queue.pauseAll` | bulk action |
| Resume all | `activity.queue.resumeAll` | bulk action |
| Clear completed | `activity.queue.clearCompleted` | bulk action |
| Clear all | `activity.queue.clearAll` | bulk action |

## 7. Settings

| Current text | Proposed key | Split note |
| --- | --- | --- |
| Interface language | `settings.language.title` | settings label |
| Changes shell labels, page headings, buttons, helper text, and errors. | `settings.language.help` | helper copy |
| Supported locales | `settings.language.supportedLocales` | section label |
| Manage translation files | `settings.language.manageFiles` | action |
| Preview locale | `settings.language.preview` | action |

## 8. Engines and Integrations

| Current text | Proposed key | Split note |
| --- | --- | --- |
| Engines | `engines.page.title` | page heading |
| Ready | `engines.status.ready` | engine status |
| Disabled | `engines.status.disabled` | engine status |
| Install dependencies | `engines.actions.installDependencies` | engine action |
| Verify | `engines.actions.verify` | engine action |
| Open settings | `engines.actions.openSettings` | engine action |
| Integrations | `integrations.page.title` | page heading |
| Local API | `integrations.api.title` | integration section |
| Enabled | `integrations.api.status.enabled` | integration status |
| Disabled | `integrations.api.status.disabled` | integration status |
| Copy endpoint | `integrations.actions.copyEndpoint` | integration action |
| View docs | `integrations.actions.viewDocs` | integration action |

## 9. First-run language picker

| Current text | Proposed key | Split note |
| --- | --- | --- |
| Choose your language | `onboarding.language.title` | first-run modal title |
| This sets the app language for buttons, pages, and helper text. You can change it later in Settings. | `onboarding.language.body` | onboarding helper copy |
| Continue | `onboarding.language.continue` | primary action |
| Keep English | `onboarding.language.keepEnglish` | secondary action |
| English (source) | `onboarding.language.option.en` | locale option |
| Español (España) | `onboarding.language.option.esES` | locale option |
| Français (France) | `onboarding.language.option.frFR` | locale option |

## 10. Common Dialog and Action Text

| Current text | Proposed key | Split note |
| --- | --- | --- |
| Cancel | `common.actions.cancel` | shared action |
| Save | `common.actions.save` | shared action |
| Delete | `common.actions.delete` | shared action |
| Search voices… | `voices.search.placeholder` | placeholder text |
| Search within chapter… | `book.chapter.search.placeholder` | placeholder text |
| View Docs | `common.actions.viewDocs` | shared action |

## 11. Split candidates

These strings should not remain as one translation unit because they contain reusable parts
or locale-sensitive values.

| Current string | Better split | Why |
| --- | --- | --- |
| Good evening, Steven | `greeting + name` | allows the salutation to vary by locale and grammar |
| Runtime 1m 3s | `label + formattedDuration` | duration formatting is locale-aware |
| Predicted 3m 33s | `label + formattedDuration` | duration formatting is locale-aware |
| Status: Ready | `label + statusValue` | translators may need a different separator or word order |
| 174 words | `count + pluralized noun` | count formatting and pluralization differ by locale |
| 57s EST. GEN. | `formattedDuration + label` | abbreviated labels often need reordering |
| + New Book | `icon chrome + common.actions.newBook` | some locales may not want the plus sign leading the text |
| 1m 3s | `Intl.DurationFormat` or locale formatter | punctuation and units should not be hardcoded |
