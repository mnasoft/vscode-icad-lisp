import * as vscode from 'vscode';
import { OpenProject } from './openProject';
import { ProjectTreeProvider } from './projectTree';
import { openLspFile } from './openLspFile';
import { IconUris } from './icons';
import { AddFile2Project } from './addFile2Project';
import { SaveProject, SaveAll } from './saveProject';
import { excludeFromProject } from './excludeFile';
import { getNewProjectFilePath, createProject } from './createProject';
import { findInProject } from './findReplace/findInProject';
import { SearchTreeProvider, SummaryNode } from './findReplace/searchTree';
import { openSearchResult } from './findReplace/openSearchResult';
import { replaceInProject } from './findReplace/replaceInProject';
import { CheckUnsavedChanges } from './checkUnsavedChanges';
import { clearSearchResults, clearSearchResultWithError, stopSearching, getWarnIsSearching } from './findReplace/clearResults';
import { RefreshProject } from './refreshProject';
import { IcadExt } from '../context';
import * as fs from 'fs-extra';

import * as nls from 'vscode-nls';
import { grantExePermission } from './findReplace/ripGrep';
const localize = nls.loadMessageBundle();

export function registerProjectCommands(context: vscode.ExtensionContext) {
    try {

        context.subscriptions.push(vscode.commands.registerCommand('icad.createProject', async () => {
            try {
                if (getWarnIsSearching())
                    return;

                if (await CheckUnsavedChanges()) {
                    return;
                }

                let prjPath = await getNewProjectFilePath();
                if (!prjPath)
                    return;

                let prjNode = await createProject(prjPath.fsPath);

                ProjectTreeProvider.instance().updateData(prjNode);

                await SaveProject(false);
            }
            catch (err) {
                let msg = localize("icad-lisp.project.commands.createprojectfailed", "Failed to create the new project.");
                showErrorMessage(msg, err);
            }
        }));

        context.subscriptions.push(vscode.commands.registerCommand('icad.openProject', async () => {
            if (getWarnIsSearching())
                return;

            OpenProject()
                .then(prjNode => {
                    if (!prjNode)
                        return;//it's possible that the user cancelled the operation

                    ProjectTreeProvider.instance().updateData(prjNode);
                })
                .catch(err => {
                    let msg = localize("icad-lisp.project.commands.openprojectfailed", "Failed to open the specified project.");
                    showErrorMessage(msg, err);
                });
        }));

        context.subscriptions.push(vscode.commands.registerCommand('icad.closeProject', async () => {
            if (ProjectTreeProvider.hasProjectOpened() === true){
                let promptmsg = localize("icad-lisp.project.commands.closepromptmsg", "Confirm close request on: ");
                let responseYes = localize("icad-lisp.project.commands.closepromptyes", "Yes");
                let responseNo = localize("icad-lisp.project.commands.closepromptno", "No");
                vscode.window.showWarningMessage(promptmsg + ProjectTreeProvider.instance().projectNode.projectName, responseYes, responseNo).then(result => {
                    if (result === responseYes){
                        ProjectTreeProvider.instance().updateData(null);
                    }
                });
            }
        }));

        context.subscriptions.push(vscode.commands.registerCommand('icad.addFile2Project', async () => {
            if (getWarnIsSearching())
                return;

            try {
                let addedFiles = await AddFile2Project();
                if (!addedFiles)
                    return;//it's possible that the user cancelled the operation
            }
            catch (err) {
                let msg = localize("icad-lisp.project.commands.addfilefailed", "Failed to add selected files to project.");
                showErrorMessage(msg, err);
                return;
            }

            try {
                await SaveProject(true);
            }
            catch (err) {
                let msg = localize("icad-lisp.project.commands.saveprojectfailed", "Failed to save the project.");
                showErrorMessage(msg, err);
            }
        }));

        context.subscriptions.push(vscode.commands.registerCommand('icad.addWorkspaceFile2Project', async (clickedFile: vscode.Uri, selectedFiles: vscode.Uri[]) => {
            if (!selectedFiles || selectedFiles.length === 0 || getWarnIsSearching()){
                return;
            }
            let selectedDirs = selectedFiles.filter(f => fs.statSync(f.fsPath, { bigint: false}).isDirectory());
            selectedFiles = selectedFiles.filter(f => 
                fs.statSync(f.fsPath, { bigint: false}).isFile() &&
                IcadExt.Documents.getSelectorType(f.fsPath) === IcadExt.Selectors.LSP
            );
            
            selectedDirs.forEach(dir => {
                fs.readdirSync(dir.fsPath).forEach(name => {
                    const fspath = dir.fsPath.replace(/[\/\\]$/, '') + '\\' + name;
                    if (fs.existsSync(fspath) && fs.statSync(fspath, { bigint: false}).isFile()) {
                        if (IcadExt.Documents.getSelectorType(fspath) === IcadExt.Selectors.LSP){
                            selectedFiles.push(vscode.Uri.file(fspath));
                        }
                    }
                });
            });

            try {
                let addedFiles = await AddFile2Project(selectedFiles);
                if (!addedFiles){
                    return; //it's possible that the user cancelled the operation
                } else {                    
                    const msg = localize("icad-lisp.project.commands.addedworkspacefiles", 'lisp files have been added to');
                    vscode.window.showInformationMessage(addedFiles.length + ' ' + msg + ' ' + ProjectTreeProvider.instance().projectNode.projectName + '.prj');
                }
            }
            catch (err) {
                let msg = localize("icad-lisp.project.commands.addfilefailed", "Failed to add selected files to project.");
                showErrorMessage(msg, err);
                return;
            }

            try {
                await SaveProject(true);
            }
            catch (err) {
                let msg = localize("icad-lisp.project.commands.saveprojectfailed", "Failed to save the project.");
                showErrorMessage(msg, err);
            }
        }));

        context.subscriptions.push(vscode.commands.registerCommand('icad.removeFileFromProject', async (selected) => {
            if (getWarnIsSearching())
                return;

            try {
                await excludeFromProject(selected);
            }
            catch (err) {
                let msg = localize("icad-lisp.project.commands.removefilefailed", "Failed to remove selected file.");
                showErrorMessage(msg, err);
                return;
            }

            try {
                await SaveProject(true);
            }
            catch (err) {
                let msg = localize("icad-lisp.project.commands.saveprojectfailed", "Failed to save the project.");
                showErrorMessage(msg, err);
            }
        }));

        context.subscriptions.push(vscode.commands.registerCommand('icad.SaveProject', async () => {
            if (getWarnIsSearching())
                return;

            SaveProject(true)
                .then(prjPath => {
                    let msg = localize("icad-lisp.project.commands.projectsaved", "Project file saved.");
                    vscode.window.showInformationMessage(msg);
                })
                .catch(err => {
                    let msg = localize("icad-lisp.project.commands.saveprojectfailed", "Failed to save the project.");
                    showErrorMessage(msg, err);
                });
        }));

        context.subscriptions.push(vscode.commands.registerCommand('icad.loadProjectFiles', async () => {
            if (getWarnIsSearching())
                return;

            if (!ProjectTreeProvider.hasProjectOpened()) {
                const msg = localize("icad-lisp.project.commands.loadall.openproject", "Open a project before loading project files.");
                vscode.window.showErrorMessage(msg);
                return;
            }

            const session = vscode.debug.activeDebugSession;
            if (!session) {
                const msg = localize("icad-lisp.project.commands.loadall.attach", "First, attach to or launch a host application before loading project files.");
                vscode.window.showErrorMessage(msg);
                return;
            }

            const projectNode = ProjectTreeProvider.instance().projectNode;
            const existingLspFiles = projectNode.sourceFiles
                .map(fileNode => fileNode.filePath)
                .filter(filePath => filePath.toUpperCase().endsWith('.LSP') && fs.existsSync(filePath));

            if (existingLspFiles.length === 0) {
                const msg = localize("icad-lisp.project.commands.loadall.nofiles", "No existing LSP files were found in the project.");
                vscode.window.showInformationMessage(msg);
                return;
            }

            let loadedCount = 0;
            let failedCount = 0;

            for (const filePath of existingLspFiles) {
                try {
                    await session.customRequest("customLoad", { path: filePath });
                    loadedCount++;
                }
                catch (err) {
                    failedCount++;
                    console.log(err);
                }
            }

            if (failedCount > 0) {
                const msg = localize("icad-lisp.project.commands.loadall.partial", "Loaded {0} file(s); failed to load {1} file(s).", loadedCount, failedCount);
                vscode.window.showWarningMessage(msg);
                return;
            }

            const msg = localize("icad-lisp.project.commands.loadall.success", "Loaded {0} project file(s).", loadedCount);
            vscode.window.showInformationMessage(msg);
        }));

        context.subscriptions.push(vscode.commands.registerCommand('icad.SaveAll', async () => {
            if (getWarnIsSearching())
                return;

            SaveAll()
                .then(() => {
                    let msg = localize("icad-lisp.project.commands.allsaved", "All files saved.");
                    vscode.window.showInformationMessage(msg);
                })
                .catch(err => {
                    let msg = localize("icad-lisp.project.commands.saveallfailed", "Failed to save all the files in the project.");
                    showErrorMessage(msg, err);
                });
        }));

        context.subscriptions.push(vscode.commands.registerCommand('icad.refresh', async () => {
            try {
                RefreshProject();
            } catch (err) {
                let msg = localize("icad-lisp.project.commands.refreshfailed", "Failed to refresh the project.");
                showErrorMessage(msg, err);
            }
        }));

        context.subscriptions.push(vscode.commands.registerCommand(ProjectTreeProvider.TreeItemClicked, (treeItem) => {
            openLspFile(treeItem)
                .catch(err => {
                    let msg = localize("icad-lisp.project.commands.openfilefailed", "Failed to open the file.");
                    showErrorMessage(msg, err);
                })
        }));

        //register the handler of "find in project"
        context.subscriptions.push(vscode.commands.registerCommand('icad.findInProject', async () => {
            if (getWarnIsSearching())
                return;

            findInProject().catch(err => {
                let msg = localize("icad-lisp.project.commands.findfailed", "Failed to find in project.");
                showErrorMessage(msg, err);
                clearSearchResultWithError(msg + (err ? err.toString() : ''));
            });
        }));

        //register the handler of "replace in project"
        context.subscriptions.push(vscode.commands.registerCommand('icad.replaceInProject', async () => {
            if (getWarnIsSearching())
                return;

            replaceInProject().catch(err => {
                let msg = localize("icad-lisp.project.commands.replacefailed", "Failed to replace text string in project.");
                showErrorMessage(msg, err);
                clearSearchResultWithError(msg + (err ? err.toString() : ''));
            })
        }));

        context.subscriptions.push(vscode.commands.registerCommand(SearchTreeProvider.showResult, (treeItem) => {
            openSearchResult(treeItem, SearchTreeProvider.instance.lastSearchOption)
                .catch(err => {
                    let msg = localize("icad-lisp.project.commands.openresultfailed", "Failed to open search results.");
                    showErrorMessage(msg, err);
                })
        }));

        context.subscriptions.push(vscode.commands.registerCommand('icad.clearSearchResults', (treeItem) => {
            if (getWarnIsSearching())
                return;

            try {
                clearSearchResults();
            }
            catch (err) {
                let msg = localize("icad-lisp.project.commands.clearresultfailed", "Failed to clear search results.");
                showErrorMessage(msg, err);
            }
        }));

        context.subscriptions.push(vscode.commands.registerCommand('icad.stopSearch', () => {
            try {
                stopSearching();
            }
            catch (err) {
                if (err)
                    console.log(err.toString());
            }
        }));

        IconUris.initialize();

        grantExePermission();
    }
    catch (e) {
        let msg = localize("icad-lisp.project.commands.initializefailed", "Failed to initalize the LISP Project Manager.");
        vscode.window.showErrorMessage(msg);
        console.log(e);
    }
}

const showErrOpt = { modal: true };

export function showErrorMessage(description: string, detail: string) {
    if (!detail) {
        vscode.window.showErrorMessage(description, showErrOpt);
    } else {
        vscode.window.showErrorMessage(description + "\r\n" + detail, showErrOpt);
    }
}
