import _chai from 'chai';
import _sinonChai from 'sinon-chai';
_chai.use(_sinonChai);

import { UiTaskFactory } from '../../../src/task-factories/ui-task-factory.js';
import { Project } from '../../../src/project.js';
import {
    buildProjectDefinition,
    createModuleImporter,
    createTaskBuilderImportDefinitions,
    createTaskBuilderImportMocks,
} from '../../utils/object-builder.js';

import {
    injectFactoryInitTests,
    injectUnsupportedTasksTests,
    injectTaskBuilderCompositionTests,
} from '../../utils/task-factory-snippets.js';

describe('[UiTaskFactory]', function () {
    const _builderNames = [
        'clean',
        'format',
        'lint',
        'lint-fix',
        'test-ui',
        'docs',
        'build',
    ];
    const importDefinitions = createTaskBuilderImportDefinitions(_builderNames);

    const _importModule = createModuleImporter(
        'src/task-factories/ui-task-factory.js',
        {
            taskFactoryMock: 'src/task-factory.js',
            ...importDefinitions,
        },
        'UiTaskFactory',
    );

    injectFactoryInitTests(
        _importModule,
        new Project(buildProjectDefinition()),
    );

    function _getExpectedTaskBuilders(project) {
        const builders = [
            { name: 'clean', ctorArgs: [] },
            { name: 'format', ctorArgs: [] },
            { name: 'lint', ctorArgs: [] },
            { name: 'lint-fix', ctorArgs: [] },
            { name: 'test-ui', ctorArgs: [] },
            { name: 'docs', ctorArgs: [project] },
            { name: 'build', ctorArgs: [project] },
        ];

        return builders;
    }

    describe('_createTaskBuilders()', function () {
        const PROJECT_TYPE = 'ui';
        async function _createFactory(overrides) {
            const { mocks, mockReferences } =
                createTaskBuilderImportMocks(_builderNames);
            const TaskFactory = await _importModule(mockReferences);
            const definition = buildProjectDefinition(overrides);
            const project = new Project(definition);
            const factory = new TaskFactory(project);

            return { project, factory, mocks };
        }

        injectUnsupportedTasksTests(PROJECT_TYPE, _createFactory);

        injectTaskBuilderCompositionTests(
            PROJECT_TYPE,
            _createFactory,
            _getExpectedTaskBuilders,
        );
    });
});
