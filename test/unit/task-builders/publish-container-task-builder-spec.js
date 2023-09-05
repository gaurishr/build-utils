import _chai, { expect } from 'chai';
import _sinonChai from 'sinon-chai';
_chai.use(_sinonChai);

import _path from 'path';
import _camelcase from 'camelcase';

import { stub } from 'sinon';
import _esmock from 'esmock';
import { Project } from '../../../src/project.js';
import {
    getAllButString,
    getAllProjectOverrides,
    makeOptional,
} from '../../utils/data-generator.js';
import {
    buildProjectDefinition,
    createModuleImporter,
    createGulpMock,
} from '../../utils/object-builder.js';
import { injectBuilderInitTests } from '../../utils/task-builder-snippets.js';

const specificContainerTarget = 'myBuildArm'; // This is a second build defined in object-builder.js

describe('[PublishContainerTaskBuilder]', () => {
    const _importModule = createModuleImporter(
        'src/task-builders/publish-container-task-builder.js',
        {
            execaModuleMock: 'execa',
            gulpMock: 'gulp',
            taskBuilderMock: 'src/task-builder.js',
        },
        'PublishContainerTaskBuilder'
    );

    describe('ctor() <target, tag>', () => {
        getAllButString('').forEach((target) => {
            it(`should throw an error if invoked without a valid target (value=${target})`, async () => {
                const TaskBuilder = await _importModule();
                const error = 'Invalid target (arg #1)';
                const tag = undefined;
                const wrapper = () => new TaskBuilder(target, tag);

                expect(wrapper).to.throw(error);
            });
        });

        makeOptional(getAllButString('')).forEach((tag) => {
            it(`should throw an error if invoked without a tag (value=${tag})`, async () => {
                const TaskBuilder = await _importModule();
                const error = 'Invalid tag (arg #2)';
                const wrapper = () =>
                    new TaskBuilder(specificContainerTarget, tag);

                expect(wrapper).to.throw(error);
            });
        });
    });

    [undefined, '1.0.0'].forEach((tag) => {
        ['default', specificContainerTarget].forEach((target) => {
            injectBuilderInitTests(
                _importModule,
                `publish-container${
                    target === 'default' ? '' : '-' + target // Specifying a non default container creates a named task
                }`,
                `Publish container image for ${target}:${tag || 'latest'}`,
                [target, tag]
            );
        });
    });

    getAllProjectOverrides().forEach(({ title, overrides }) => {
        describe(`[Task Build] - (${title})`, () => {
            it('should throw an error if the specified target has not been defined', async () => {
                const TaskBuilder = await _importModule();
                const definition = buildProjectDefinition();
                const project = new Project(definition);
                const target = 'badStack';

                const builder = new TaskBuilder(target);

                const wrapper = () => builder.buildTask(project);

                // Note - this  error is thrown by the project object, not the task builder
                expect(wrapper).to.throw(new RegExp(`.*${target}.*`));
            });

            it('should invoke gulp to chain the tag and publish tasks', async () => {
                const gulpMock = createGulpMock();
                const TaskBuilder = await _importModule({
                    gulpMock,
                });
                const definition = buildProjectDefinition();
                const project = new Project(definition);

                const builder = new TaskBuilder(specificContainerTarget);

                expect(gulpMock.series).to.not.have.been.called;

                builder.buildTask(project);

                expect(gulpMock.series).to.have.been.calledOnce;
                expect(gulpMock.series.args[0]).to.have.length(1);
                expect(gulpMock.series.args[0][0])
                    .to.be.an('array')
                    .and.to.have.lengthOf(2);
                gulpMock.series.args[0][0].forEach((task) => {
                    expect(task).to.be.a('function');
                });
            });
        });
    });

    describe('[task]', () => {
        async function _createTask(definitionOverrides, target, tag) {
            if (typeof target !== 'string' || target.length === 0) {
                target = 'default';
            }
            const execaModuleMock = {
                execa: stub().callsFake(() => ({
                    source: '_execa_ret_',
                })),
            };
            const gulpMock = createGulpMock();
            const PublishContainerTaskBuilder = await _importModule({
                execaModuleMock,
                gulpMock,
            });
            const definition = buildProjectDefinition(definitionOverrides);
            const project = new Project(definition);
            const builder = new PublishContainerTaskBuilder(target, tag);

            return {
                project,
                execaModuleMock,
                task: builder.buildTask(project),
                gulpMock,
            };
        }

        const semverComponentsObj = {
            latest: ['latest'],
            1: ['1.0.0', '1.0', '1', 'latest'],
            '1.0': ['1.0.0', '1.0', '1', 'latest'],
            '1.0.0': ['1.0.0', '1.0', '1', 'latest'],
        };

        getAllProjectOverrides().forEach(({ title, overrides }) => {
            ['latest', '1', '1.0', '1.0.0'].forEach((tag) => {
                describe(`Verify task - publish to container registry - (${title})`, () => {
                    it(`should use the docker cli to tag the container image (tag=${tag})`, async () => {
                        const target = 'default';
                        const {
                            execaModuleMock: { execa: execaMock },
                            gulpMock,
                        } = await _createTask(
                            {
                                ...overrides,
                            },
                            target,
                            tag
                        );

                        expect(execaMock).to.not.have.been.called;

                        const semverComponents = semverComponentsObj[tag];

                        // The number of tasks should be double the semver components
                        expect(gulpMock.series.args[0][0]).to.have.lengthOf(
                            semverComponents.length * 2,
                            'Number of tasks in gulp series is incorrect'
                        );

                        semverComponents.forEach((semTag, index) => {
                            const task = gulpMock.series.args[0][0][index];

                            const dockerBin = 'docker';
                            const expectedArgs = [
                                'tag',
                                target,
                                `${target}:${semTag}`,
                            ];

                            execaMock.reset();

                            task();

                            expect(execaMock).to.have.been.calledOnce;

                            expect(execaMock.args[0]).to.have.lengthOf(3);

                            // First arg
                            expect(execaMock.args[0][0]).to.equal(dockerBin);

                            // Second arg
                            expect(execaMock.args[0][1])
                                .to.be.an('array')
                                .and.to.have.length(expectedArgs.length);
                            expectedArgs.forEach((arg, index) => {
                                expect(execaMock.args[0][1][index]).to.equal(
                                    arg
                                );
                            });

                            // Third arg
                            expect(execaMock.args[0][2]).to.deep.equal({
                                stdio: 'inherit',
                            });
                        });
                    });

                    it(`should use the docker cli to publish the image to the cloud (tag=${tag})`, async () => {
                        const target = 'default';
                        const {
                            execaModuleMock: { execa: execaMock },
                            gulpMock,
                        } = await _createTask(
                            {
                                ...overrides,
                            },
                            target,
                            tag
                        );

                        expect(execaMock).to.not.have.been.called;

                        const semverComponents = semverComponentsObj[tag];

                        // The number of tasks should be double the semver components
                        expect(gulpMock.series.args[0][0]).to.have.lengthOf(
                            semverComponents.length * 2,
                            'Number of tasks in gulp series is incorrect'
                        );

                        semverComponents.forEach((semTag, index) => {
                            const task =
                                gulpMock.series.args[0][0][
                                    index + semverComponents.length
                                ];

                            const dockerBin = 'docker';
                            const expectedArgs = [
                                'push',
                                `${target}:${semTag}`,
                            ];

                            execaMock.reset();

                            task();

                            expect(execaMock).to.have.been.calledOnce;

                            expect(execaMock.args[0]).to.have.lengthOf(3);

                            // First arg
                            expect(execaMock.args[0][0]).to.equal(dockerBin);

                            // Second arg
                            expect(execaMock.args[0][1])
                                .to.be.an('array')
                                .and.to.have.length(expectedArgs.length);
                            expectedArgs.forEach((arg, index) => {
                                expect(execaMock.args[0][1][index]).to.equal(
                                    arg
                                );
                            });

                            // Third arg
                            expect(execaMock.args[0][2]).to.deep.equal({
                                stdio: 'inherit',
                            });
                        });
                    });
                });
            });
        });
    });
});
