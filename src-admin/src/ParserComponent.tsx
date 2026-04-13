import React from 'react';

import {
    TableContainer,
    TableHead,
    Table,
    TableBody,
    TableRow,
    TableCell,
    Paper,
    TextField,
    Checkbox,
    IconButton,
    Select,
    MenuItem,
    LinearProgress,
    Fab,
    Tooltip,
} from '@mui/material';

import { Edit, Delete, ContentCopy, Add, FolderOpen, AccountTree, FileDownload, FileUpload } from '@mui/icons-material';

// important to make from package and not from some children.
// invalid
// import Confirm from '@iobroker/adapter-react-v5/Confirm';
// valid
import { I18n, Confirm, DialogSelectID, DialogSelectFile, DialogCron } from '@iobroker/adapter-react-v5';
import { ConfigGeneric, type ConfigGenericProps, type ConfigGenericState } from '@iobroker/json-config';

import { EditDialog } from './EditDialog';
import type { ParserState, ParserRule } from './types';

const styles: Record<string, any> = {
    table: {
        minWidth: 400,
    },
    header: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    ok: {
        color: '#0ba20b',
    },
    warn: {
        color: '#f57d1d',
    },
    error: {
        color: '#c42c3a',
    },
    cell: {
        padding: '6px 3px',
    },
    colIndex: {
        width: 20,
    },
    colActive: {
        width: 50,
    },
    colName: {
        width: 150,
    },
    colUrl: {},
    colRegEx: {},
    colItem: {
        width: 70,
    },
    colRole: {
        width: 70,
        textAlign: 'center',
    },
    colType: {
        width: 70,
        textAlign: 'center',
    },
    colComma: {
        width: 50,
    },
    colUnit: {
        width: 70,
    },
    colSubstituteOld: {
        width: 45,
        textAlign: 'center',
    },
    colSubstitute: {
        width: 70,
    },
    colFactor: {
        width: 50,
    },
    colOffset: {
        width: 50,
    },
    colInterval: {
        width: 130,
    },
    colLogLevel: {
        width: 70,
    },
    colLogSource: {
        width: 120,
    },
    colButtons: {
        width: 140,
        textAlign: 'right',
    },
    changedRow: {
        backgroundColor: '#795d5d',
    },
    cardPaper: {
        marginBottom: 8,
        padding: '8px 12px',
    },
    cardLabel: {
        fontWeight: 'bold',
        whiteSpace: 'nowrap',
        width: 90,
        padding: '4px 8px 4px 0',
        border: 'none',
        verticalAlign: 'middle',
    },
    cardValue: {
        padding: '4px 0',
        border: 'none',
        verticalAlign: 'middle',
    },
};

interface ParserComponentState extends ConfigGenericState {
    showEditDialog: ParserRule | null;
    error: false | number;
    alive: boolean;
    rules: ParserRule[] | null;
    showDeleteDialog: null | number;
    showSelectIdDialog: number | null;
    showSelectFileDialog: number | null;
    showCronDialog: number | null;
    logSources: string[];
    changed: number[];
    width: number;
}

function csvEscape(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"' && line[i + 1] === '"') {
                field += '"';
                i++;
            } else if (ch === '"') {
                inQuotes = false;
            } else {
                field += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                result.push(field);
                field = '';
            } else {
                field += ch;
            }
        }
    }
    result.push(field);
    return result;
}

function parseCSV(text: string): string[][] {
    const rows: string[][] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '"') {
            inQuotes = !inQuotes;
            current += ch;
        } else if (!inQuotes && (ch === '\r' || ch === '\n')) {
            if (ch === '\r' && text[i + 1] === '\n') {
                i++;
            }
            if (current) {
                rows.push(parseCSVLine(current));
            }
            current = '';
        } else {
            current += ch;
        }
    }
    if (current) {
        rows.push(parseCSVLine(current));
    }
    return rows;
}

export default class ParserComponent extends ConfigGeneric<ConfigGenericProps, ParserComponentState> {
    private readonly namespace: string;
    private saveTimer: ReturnType<typeof setTimeout> | null = null;
    private resizeTimeout: ReturnType<typeof setTimeout> | null = null;
    private readonly refDiv: React.RefObject<HTMLDivElement>;
    private readonly fileInputRef: React.RefObject<HTMLInputElement> = React.createRef();

    constructor(props: ConfigGenericProps) {
        super(props);
        this.state = {
            ...this.state,
            showEditDialog: null,
            rules: null,
            error: false,
            showDeleteDialog: null,
            showSelectIdDialog: null,
            showSelectFileDialog: null,
            showCronDialog: null,
            logSources: [],
            changed: [],
            alive: false,
            width: 0,
        };
        this.namespace = `${this.props.oContext.adapterName}.${this.props.oContext.instance}.`;
        this.refDiv = React.createRef();
    }

    async componentDidMount(): Promise<void> {
        super.componentDidMount();
        const rows = await this.props.oContext.socket.getObjectViewSystem(
            'state',
            this.namespace,
            `${this.namespace}\u9999`,
        );

        const state = await this.props.oContext.socket
            .getState(`system.adapter.${this.namespace}alive`)
            .catch(() => null);

        const rules = Object.keys(rows).map(id => {
            const state = rows[id] as ParserState;
            return {
                _id: id,
                common: {
                    name: id.substring(this.namespace.length),
                    enabled: state.common.enabled !== false,
                    role: state.common.role,
                    type: state.common.type,
                    unit: state.common.unit,
                },
                native: {
                    type: state.native.type,
                    link: state.native.link,
                    logLevel: state.native.logLevel,
                    logSource: state.native.logSource,
                    item: state.native.item || 0,
                    regex: state.native.regex,
                    interval: state.native.interval,
                    cron: state.native.cron || '',
                    substitute: state.native.substitute,
                    substituteOld: state.native.substituteOld,
                    offset: state.native.offset,
                    factor: state.native.factor,
                    parseHtml: state.native.parseHtml,
                },
            };
        });
        rules.sort((a, b) => a.common.name.localeCompare(b.common.name));

        const [instancesObj, hostsObj] = await Promise.all([
            this.props.oContext.socket
                .getObjectViewSystem('instance', 'system.adapter.', `system.adapter.\u9999`)
                .catch(() => ({})),
            this.props.oContext.socket
                .getObjectViewSystem('host', 'system.host.', `system.host.\u9999`)
                .catch(() => ({})),
        ]);
        // Build grouped source list: for each adapter show wildcard then instances;
        // for hosts show system.host.* wildcard then specific hosts.
        // Exclude www-only adapters (no log output) and sort.
        const instances = instancesObj as Record<string, ioBroker.InstanceObject>;
        const instanceIds = Object.keys(instances)
            .filter(id => !instances[id]?.common?.onlyWWW)
            .sort();
        const hostIds = Object.keys(hostsObj).sort();

        // Group instance IDs by adapter name (system.adapter.NAME.NUM → NAME)
        const adapterNames = [
            ...new Set(instanceIds.map(id => id.replace(/^system\.adapter\.([-\w]+)\..+$/, '$1'))),
        ].sort();

        const logSources: string[] = [];
        for (const adapterName of adapterNames) {
            const adapterInstances = instanceIds.filter(id => id.startsWith(`system.adapter.${adapterName}.`));
            if (adapterInstances.length > 1) {
                logSources.push(`system.adapter.${adapterName}.*`);
            }
            logSources.push(...adapterInstances);
        }
        if (hostIds.length) {
            logSources.push('system.host.*');
            logSources.push(...hostIds);
        }

        this.setState({ rules, alive: state ? (state.val as boolean) : false, logSources });
        await this.props.oContext.socket.subscribeObject(`${this.namespace}*`, this.onObjectChange);
        await this.props.oContext.socket.subscribeState(`system.adapter.${this.namespace}*`, this.onAliveChange);
    }

    async componentWillUnmount(): Promise<void> {
        await this.props.oContext.socket.unsubscribeObject(`${this.namespace}*`, this.onObjectChange);
        this.props.oContext.socket.unsubscribeState(`system.adapter.${this.namespace}*`, this.onAliveChange);
        if (this.resizeTimeout) {
            clearTimeout(this.resizeTimeout);
            this.resizeTimeout = null;
        }
    }

    componentDidUpdate(): void {
        if (this.refDiv.current?.clientWidth && this.refDiv.current.clientWidth !== this.state.width) {
            if (this.resizeTimeout) {
                clearTimeout(this.resizeTimeout);
            }
            this.resizeTimeout = setTimeout(() => {
                this.resizeTimeout = null;
                this.setState({ width: this.refDiv.current?.clientWidth || 0 });
            }, 50);
        }
    }

    getCurrentBreakpoint(): 'xs' | 'sm' | 'md' | 'lg' | 'xl' {
        if (!this.state.width) {
            return 'md';
        }
        if (this.state.width < 600) {
            return 'xs';
        }
        if (this.state.width < 900) {
            return 'sm';
        }
        if (this.state.width < 1200) {
            return 'md';
        }
        if (this.state.width < 1536) {
            return 'lg';
        }
        return 'xl';
    }

    onObjectChange = (id: string, obj: ioBroker.Object | null | undefined): void => {
        if (!id) {
            return;
        }
        const rules: ParserRule[] = JSON.parse(JSON.stringify(this.state.rules));
        const ruleIndex = rules.findIndex(rule => rule._id === id);
        if (!obj) {
            // delete rule
            if (ruleIndex !== -1) {
                rules.splice(ruleIndex, 1);
                this.setState({ rules });
            }
        } else {
            // update existing rule
            if (ruleIndex !== -1) {
                rules[ruleIndex] = {
                    _id: id,
                    common: {
                        name: id.substring(this.namespace.length),
                        enabled: obj.common.enabled !== false,
                        role: obj.common.role,
                        type: obj.common.type,
                        unit: obj.common.unit,
                        read: true,
                        write: true,
                    },
                    native: {
                        type: obj.native.type,
                        link: obj.native.link,
                        logLevel: obj.native.logLevel,
                        logSource: obj.native.logSource,
                        item: obj.native.item || 0,
                        regex: obj.native.regex,
                        interval: obj.native.interval,
                        cron: obj.native.cron || '',
                        substitute: obj.native.substitute,
                        substituteOld: obj.native.substituteOld,
                        offset: obj.native.offset,
                        factor: obj.native.factor,
                        parseHtml: obj.native.parseHtml,
                    },
                };
                if (JSON.stringify(this.state.rules![ruleIndex]) === JSON.stringify(rules[ruleIndex])) {
                    return;
                }
            } else {
                // add new rule
                rules.push({
                    _id: id,
                    common: {
                        name: id.substring(this.namespace.length),
                        enabled: obj.common.enabled !== false,
                        role: obj.common.role,
                        type: obj.common.type,
                        unit: obj.common.unit,
                    },
                    native: {
                        type: obj.native.type,
                        link: obj.native.link,
                        logLevel: obj.native.logLevel,
                        logSource: obj.native.logSource,
                        item: obj.native.item || 0,
                        regex: obj.native.regex,
                        interval: obj.native.interval,
                        cron: obj.native.cron || '',
                        substitute: obj.native.substitute,
                        substituteOld: obj.native.substituteOld,
                        offset: obj.native.offset,
                        factor: obj.native.factor,
                        parseHtml: obj.native.parseHtml,
                    },
                });
            }
            rules.sort((a, b) => a.common.name.localeCompare(b.common.name));

            this.setState({ rules });
        }
    };

    onAliveChange = (id: string, state: ioBroker.State | null | undefined): void => {
        if (id === `system.adapter.${this.namespace}alive` && this.state.alive !== !!state?.val) {
            this.setState({ alive: !!state?.val });
        }
    };

    async fetchText(link: string, type?: string): Promise<string | null> {
        if (!this.state.alive || type === 'ioblog') {
            return Promise.resolve(null);
        }
        let uri = link;
        if (type === 'iobstate') {
            uri = `iobstate://${link}`;
        } else if (type === 'iobfile') {
            uri = `iobfile://${link}`;
        }
        try {
            const result = await this.props.oContext.socket.sendTo(
                `${this.props.oContext.adapterName}.${this.props.oContext.instance}`,
                'link',
                uri,
            );
            if (result?.error) {
                window.alert(result.error);
                return null;
            }
            return result?.text ?? null;
        } catch {
            return null;
        }
    }

    checkError(): number | false {
        if (!this.state.rules) {
            return false;
        }
        // find empty ids
        const errorIndex = this.state.rules.findIndex(rule => !rule.common.name);
        if (errorIndex !== -1) {
            return errorIndex;
        }

        // find duplicate IDs
        for (let i = 0; i < this.state.rules.length; i++) {
            for (let j = i + 1; j < this.state.rules.length; j++) {
                if (this.state.rules[i].common.name === this.state.rules[j].common.name) {
                    return j;
                }
            }
        }
        return false;
    }

    onAutoSave(index: number): void {
        const changed = [...this.state.changed];
        if (!changed.includes(index)) {
            changed.push(index);
            this.setState({ changed });
        }

        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
        }
        this.saveTimer = setTimeout(async () => {
            this.saveTimer = null;
            let rulesChanged = false;
            const rules: ParserRule[] = JSON.parse(JSON.stringify(this.state.rules));
            const tasks: ioBroker.StateObject[] = [];

            // got through all changed lines
            for (let c = 0; c < this.state.changed.length; c++) {
                const _index = this.state.changed[c];
                const rule = rules[_index];

                // if the name exists and it is unique
                if (rule.common.name && !rules.find((r, i) => r.common.name === rule.common.name && i !== _index)) {
                    const originalObj: ioBroker.StateObject | undefined | null = rule._id
                        ? ((await this.props.oContext.socket.getObject(rule._id)) as
                              | ioBroker.StateObject
                              | undefined
                              | null)
                        : ({ common: {}, native: {}, type: 'state' } as ioBroker.StateObject);
                    if (!originalObj) {
                        continue;
                    }
                    const obj: ioBroker.StateObject = JSON.parse(JSON.stringify(originalObj));
                    Object.assign(obj.common, rule.common);
                    Object.assign(obj.native, rule.native);

                    // if name changed
                    if (rule._id !== `${this.namespace}${rule.common.name}`) {
                        // delete old object
                        if (rule._id) {
                            await this.props.oContext.socket.delObject(rule._id);
                        }
                        // create new ID
                        rule._id = `${this.namespace}${rule.common.name}`;
                        rulesChanged = true;
                        obj._id = rule._id;
                        tasks.push(obj);
                    } else if (
                        JSON.stringify(originalObj.common) !== JSON.stringify(obj.common) ||
                        JSON.stringify(originalObj.native) !== JSON.stringify(obj.native)
                    ) {
                        // some settings changed
                        obj._id = rule._id;
                        tasks.push(obj);
                    }
                }
            }
            const newState: Partial<ParserComponentState> = {
                changed: [],
            };
            if (rulesChanged) {
                newState.rules = rules;
            }
            this.setState(newState as ParserComponentState, async () => {
                for (let i = 0; i < tasks.length; i++) {
                    await this.props.oContext.socket.setObject(tasks[i]._id, tasks[i]);
                }
            });
        }, 1000);
    }

    _onChange(index: number, isNative: boolean, attr: string, value: any): void {
        const rules: ParserRule[] = JSON.parse(JSON.stringify(this.state.rules));
        const subName = isNative ? 'native' : 'common';
        if (attr === 'comma') {
            rules[index].common.type = 'number';
        }
        (rules[index][subName] as Record<string, any>)[attr] = value;
        this.setState({ rules }, () => this.onAutoSave(index));
    }

    onAddRule(): void {
        const rules: ParserRule[] = JSON.parse(JSON.stringify(this.state.rules));
        rules.push({
            _id: '',
            common: {
                name: '',
                enabled: true,
                role: 'state',
                type: 'string',
                unit: '',
                read: true,
                write: true,
            },
            native: {
                type: 'url',
                link: '',
                item: 0,
                regex: '',
                interval: '',
                cron: '',
                substitute: '',
                substituteOld: true,
                offset: 0,
                factor: 1,
                parseHtml: false,
            },
        });
        this.setState({ rules });
    }

    exportRules(): void {
        const CSV_HEADERS = [
            'name',
            'enabled',
            'type',
            'link',
            'logLevel',
            'logSource',
            'regex',
            'item',
            'role',
            'commonType',
            'unit',
            'interval',
            'cron',
            'factor',
            'offset',
            'substitute',
            'substituteOld',
            'parseHtml',
            'comma',
        ];
        const rows = [CSV_HEADERS.join(',')];
        for (const rule of this.state.rules!) {
            const cols = [
                rule.common.name,
                String(rule.common.enabled !== false),
                rule.native.type || 'url',
                rule.native.link || '',
                rule.native.logLevel || '',
                rule.native.logSource || '',
                rule.native.regex || '',
                String(rule.native.item ?? 0),
                rule.common.role || '',
                rule.common.type || 'string',
                rule.common.unit || '',
                String(rule.native.interval || ''),
                rule.native.cron || '',
                String(rule.native.factor ?? ''),
                String(rule.native.offset ?? ''),
                String(rule.native.substitute ?? ''),
                String(!!rule.native.substituteOld),
                String(!!rule.native.parseHtml),
                String(!!rule.native.comma),
            ];
            rows.push(cols.map(csvEscape).join(','));
        }
        const blob = new Blob([rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'parser-rules.csv';
        a.click();
        URL.revokeObjectURL(url);
    }

    importRules(text: string): void {
        const rows = parseCSV(text);
        if (rows.length < 2) {
            return;
        }
        const [headers, ...dataRows] = rows;
        const col = (name: string): number => headers.indexOf(name);
        const nameIdx = col('name');
        if (nameIdx === -1) {
            window.alert(I18n.t('parser_Import invalid CSV'));
            return;
        }
        const imported: ParserRule[] = [];
        for (const cols of dataRows) {
            const name = cols[nameIdx]?.trim();
            if (!name) {
                continue;
            }
            const get = (field: string): string => cols[col(field)] ?? '';
            imported.push({
                _id: `${this.namespace}${name}`,
                common: {
                    name,
                    enabled: get('enabled') !== 'false',
                    role: get('role') || 'state',
                    type: (get('commonType') || 'string') as ioBroker.CommonType,
                    unit: get('unit') || undefined,
                    read: true,
                    write: true,
                },
                native: {
                    type: (get('type') || 'url') as ParserRule['native']['type'],
                    link: get('link'),
                    logLevel: (get('logLevel') || undefined) as ioBroker.LogLevel | undefined,
                    logSource: get('logSource') || undefined,
                    regex: get('regex'),
                    item: Number(get('item')) || 0,
                    interval: get('interval'),
                    cron: get('cron') || '',
                    factor: get('factor') !== '' ? Number(get('factor')) : 1,
                    offset: get('offset') !== '' ? Number(get('offset')) : 0,
                    substitute: get('substitute') || undefined,
                    substituteOld: get('substituteOld') !== 'false',
                    parseHtml: get('parseHtml') === 'true',
                    comma: get('comma') === 'true',
                },
            });
        }
        if (!imported.length) {
            return;
        }
        const rules: ParserRule[] = JSON.parse(JSON.stringify(this.state.rules!));
        for (const imp of imported) {
            const idx = rules.findIndex(r => r.common.name === imp.common.name);
            if (idx !== -1) {
                rules[idx] = imp;
            } else {
                rules.push(imp);
            }
        }
        rules.sort((a, b) => a.common.name.localeCompare(b.common.name));
        this.setState({ rules }, async () => {
            for (const imp of imported) {
                await this.props.oContext.socket.setObject(imp._id, {
                    type: 'state',
                    common: imp.common as ioBroker.StateCommon,
                    native: imp.native,
                });
            }
            window.alert(I18n.t('parser_Import result', imported.length));
        });
    }

    renderToolbarButtons(): React.JSX.Element {
        return (
            <>
                <Tooltip title={I18n.t('parser_Export rules')}>
                    <span>
                        <IconButton
                            size="small"
                            disabled={!this.state.rules?.length}
                            onClick={() => this.exportRules()}
                        >
                            <FileDownload />
                        </IconButton>
                    </span>
                </Tooltip>
                <Tooltip title={I18n.t('parser_Import rules')}>
                    <IconButton
                        size="small"
                        onClick={() => this.fileInputRef.current?.click()}
                    >
                        <FileUpload />
                    </IconButton>
                </Tooltip>
            </>
        );
    }

    renderSourceField(rule: ParserRule, index: number, disabled: boolean): React.JSX.Element {
        return (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2 }}>
                <Select
                    value={rule.native.type || 'url'}
                    onChange={e => {
                        const rules: ParserRule[] = JSON.parse(JSON.stringify(this.state.rules));
                        rules[index].native.type = e.target.value as ParserRule['native']['type'];
                        if (e.target.value === 'ioblog') {
                            rules[index].native.link = '';
                        }
                        this.setState({ rules }, () => this.onAutoSave(index));
                    }}
                    variant="standard"
                    disabled={disabled}
                    style={{ minWidth: 60, flexShrink: 0 }}
                >
                    <MenuItem value="url">URL</MenuItem>
                    <MenuItem value="iobstate">{I18n.t('parser_State')}</MenuItem>
                    <MenuItem value="iobfile">{I18n.t('parser_File')}</MenuItem>
                    <MenuItem value="ioblog">{I18n.t('parser_Log')}</MenuItem>
                </Select>
                {(!rule.native.type || rule.native.type === 'url') && (
                    <TextField
                        fullWidth
                        disabled={disabled}
                        value={rule.native.link}
                        onChange={e => this._onChange(index, true, 'link', e.target.value)}
                        variant="standard"
                    />
                )}
                {rule.native.type === 'iobstate' && (
                    <>
                        <TextField
                            fullWidth
                            disabled={disabled}
                            value={rule.native.link}
                            onChange={e => this._onChange(index, true, 'link', e.target.value)}
                            variant="standard"
                            placeholder="adapter.0.stateName"
                        />
                        <IconButton
                            size="small"
                            disabled={disabled}
                            onClick={() => this.setState({ showSelectIdDialog: index })}
                        >
                            <AccountTree fontSize="small" />
                        </IconButton>
                    </>
                )}
                {rule.native.type === 'iobfile' && (
                    <>
                        <TextField
                            fullWidth
                            disabled={disabled}
                            value={rule.native.link}
                            onChange={e => this._onChange(index, true, 'link', e.target.value)}
                            variant="standard"
                            placeholder="objectId/path/file.txt"
                        />
                        <IconButton
                            size="small"
                            disabled={disabled}
                            onClick={() => this.setState({ showSelectFileDialog: index })}
                        >
                            <FolderOpen fontSize="small" />
                        </IconButton>
                    </>
                )}
                {rule.native.type === 'ioblog' && (
                    <Select
                        fullWidth
                        disabled={disabled}
                        value={rule.native.logLevel || '*'}
                        onChange={e => this._onChange(index, true, 'logLevel', e.target.value)}
                        variant="standard"
                    >
                        <MenuItem value="*">{I18n.t('parser_Any')}</MenuItem>
                        <MenuItem value="silly">silly</MenuItem>
                        <MenuItem value="debug">debug</MenuItem>
                        <MenuItem value="info">info</MenuItem>
                        <MenuItem value="warn">warn</MenuItem>
                        <MenuItem value="error">error</MenuItem>
                    </Select>
                )}
                {rule.native.type === 'ioblog' ? (
                    <Select
                        fullWidth
                        disabled={disabled}
                        value={rule.native.logSource || '*'}
                        onChange={e => {
                            const val = e.target.value;
                            this._onChange(index, true, 'logSource', val === '*' ? undefined : val);
                        }}
                        variant="standard"
                    >
                        <MenuItem value="*">{I18n.t('parser_Any')}</MenuItem>
                        {this.state.logSources.map(src => (
                            <MenuItem
                                key={src}
                                value={src}
                            >
                                {src.startsWith('system.host.')
                                    ? `${src.replace('system.host.', '')} [host]`
                                    : src.startsWith('system.adapter.')
                                      ? `${src.replace('system.adapter.', '')} [instance]`
                                      : src}
                            </MenuItem>
                        ))}
                    </Select>
                ) : null}
            </div>
        );
    }

    renderCloneButton(rule: ParserRule, index: number, disabled: boolean): React.JSX.Element {
        return (
            <IconButton
                size="small"
                disabled={disabled}
                onClick={async () => {
                    const cloned: ParserRule = JSON.parse(JSON.stringify(this.state.rules![index]));
                    let i = 1;
                    let text = cloned.common.name;
                    const pattern = text.match(/(\d+)$/);
                    if (pattern) {
                        text = text.replace(pattern[0], '');
                        i = parseInt(pattern[0], 10) + 1;
                    } else {
                        text += '_';
                    }
                    while (this.state.rules!.find(it => it.common.name === text + i.toString())) {
                        i++;
                    }
                    cloned.common.name = text + i.toString();
                    cloned._id = `${this.namespace}${cloned.common.name}`;
                    await this.props.oContext.socket.setObject(`${this.namespace}${cloned.common.name}`, {
                        type: 'state',
                        common: cloned.common as ioBroker.StateCommon,
                        native: cloned.native,
                    });
                }}
            >
                <ContentCopy />
            </IconButton>
        );
    }

    renderRule(
        rule: ParserRule,
        index: number,
        anyNumber: boolean,
        anySubstituteOld: boolean,
        anyNotArray: boolean,
    ): React.JSX.Element {
        const error =
            !rule.common.name || this.state.rules?.find((r, i) => r.common.name === rule.common.name && i !== index);

        return (
            <TableRow
                key={`${index}_${rule._id}`}
                style={this.state.changed.includes(index) ? styles.changedRow : undefined}
            >
                <TableCell style={styles.cell}>{index + 1}</TableCell>
                <TableCell style={styles.cell}>
                    <Checkbox
                        disabled={!!error}
                        checked={rule.common.enabled}
                        onChange={e => this._onChange(index, false, 'enabled', e.target.checked)}
                    />
                </TableCell>
                <TableCell style={styles.cell}>
                    <TextField
                        fullWidth
                        value={rule.common.name}
                        error={!!error}
                        disabled={!rule.common.enabled}
                        onChange={e => {
                            const rules: ParserRule[] = JSON.parse(JSON.stringify(this.state.rules));
                            rules[index].common.name = e.target.value;
                            const error = this.checkError();
                            this.setState({ rules, error }, () => this.onAutoSave(index));
                        }}
                        variant="standard"
                    />
                </TableCell>
                <TableCell style={styles.cell}>
                    {this.renderSourceField(rule, index, !!error || !rule.common.enabled)}
                </TableCell>
                <TableCell style={styles.cell}>
                    <TextField
                        disabled={!!error || !rule.common.enabled}
                        fullWidth
                        value={rule.native.regex}
                        onChange={e => this._onChange(index, true, 'regex', e.target.value)}
                        variant="standard"
                    />
                </TableCell>
                {anyNotArray ? (
                    <TableCell style={styles.cell}>
                        {rule.common.type !== 'array' ? (
                            <TextField
                                fullWidth
                                disabled={!!error || !rule.common.enabled}
                                value={rule.native.item}
                                type="number"
                                slotProps={{
                                    htmlInput: {
                                        min: 0,
                                    },
                                }}
                                onChange={e => this._onChange(index, true, 'item', e.target.value)}
                                variant="standard"
                            />
                        ) : null}
                    </TableCell>
                ) : null}
                <TableCell style={styles.cell}>
                    <Select
                        fullWidth
                        disabled={!!error || !rule.common.enabled}
                        value={rule.common.role || ''}
                        onChange={e => this._onChange(index, false, 'role', e.target.value)}
                        variant="standard"
                    >
                        <MenuItem value="state">default</MenuItem>
                        <MenuItem value="">custom</MenuItem>
                        <MenuItem value="temperature">temperature</MenuItem>
                        <MenuItem value="value">value</MenuItem>
                        <MenuItem value="blinds">blinds</MenuItem>
                        <MenuItem value="switch">switch</MenuItem>
                        <MenuItem value="indicator">indicator</MenuItem>
                    </Select>
                </TableCell>
                <TableCell style={styles.cell}>
                    <Select
                        fullWidth
                        disabled={!!error || !rule.common.enabled}
                        value={rule.common.type || 'string'}
                        onChange={e => this._onChange(index, false, 'type', e.target.value)}
                        variant="standard"
                    >
                        <MenuItem value="boolean">boolean</MenuItem>
                        <MenuItem value="number">number</MenuItem>
                        <MenuItem value="string">string</MenuItem>
                        <MenuItem value="json">json</MenuItem>
                    </Select>
                </TableCell>
                {anyNumber ? (
                    <TableCell style={styles.cell}>
                        {rule.common.type === 'number' ? (
                            <Checkbox
                                disabled={!!error || !rule.common.enabled}
                                checked={!!rule.native.comma}
                                onChange={e => this._onChange(index, true, 'comma', e.target.checked)}
                            />
                        ) : null}
                    </TableCell>
                ) : null}
                {anyNumber ? (
                    <TableCell style={styles.cell}>
                        <TextField
                            fullWidth
                            disabled={!!error || !rule.common.enabled}
                            value={rule.common.unit}
                            onChange={e => this._onChange(index, false, 'unit', e.target.value)}
                            variant="standard"
                        />
                    </TableCell>
                ) : null}
                <TableCell
                    style={styles.cell}
                    title={I18n.t('parser_If new value is not available, let old value unchanged')}
                >
                    <Checkbox
                        disabled={!!error || !rule.common.enabled}
                        checked={!!rule.native.substituteOld}
                        onChange={e => this._onChange(index, true, 'substituteOld', e.target.checked)}
                    />
                </TableCell>
                {anySubstituteOld ? (
                    <TableCell
                        title={I18n.t('parser_If new value is not available, use this value')}
                        style={styles.cell}
                    >
                        {!rule.native.substituteOld ? (
                            <TextField
                                disabled={!!error || !rule.common.enabled}
                                fullWidth
                                value={rule.native.substituteOld ? '' : rule.native.substitute}
                                onChange={e => this._onChange(index, true, 'substitute', e.target.value)}
                                variant="standard"
                            />
                        ) : null}
                    </TableCell>
                ) : null}
                {anyNumber ? (
                    <TableCell style={styles.cell}>
                        {rule.common.type === 'number' ? (
                            <TextField
                                disabled={!!error || !rule.common.enabled}
                                fullWidth
                                value={rule.native.factor}
                                onChange={e => this._onChange(index, true, 'factor', e.target.value)}
                                variant="standard"
                            />
                        ) : null}
                    </TableCell>
                ) : null}
                {anyNumber ? (
                    <TableCell style={styles.cell}>
                        {rule.common.type === 'number' ? (
                            <TextField
                                disabled={!!error || !rule.common.enabled}
                                fullWidth
                                value={rule.native.offset}
                                onChange={e => this._onChange(index, true, 'offset', e.target.value)}
                                variant="standard"
                            />
                        ) : null}
                    </TableCell>
                ) : null}
                <TableCell style={{ ...styles.cell, whiteSpace: 'nowrap' }}>
                    <Tooltip title={I18n.t('parser_Use cron expression')}>
                        <Checkbox
                            size="small"
                            disabled={!!error || !rule.common.enabled}
                            checked={!!rule.native.cron}
                            onChange={e => {
                                if (e.target.checked) {
                                    this.setState({ showCronDialog: index });
                                } else {
                                    this._onChange(index, true, 'cron', '');
                                }
                            }}
                        />
                    </Tooltip>
                    {rule.native.cron ? (
                        <span
                            style={{
                                cursor: !error && rule.common.enabled ? 'pointer' : 'default',
                                textDecoration: 'underline',
                                opacity: !error && rule.common.enabled ? 1 : 0.5,
                                verticalAlign: 'middle',
                            }}
                            onClick={() => {
                                if (!error && rule.common.enabled) {
                                    this.setState({ showCronDialog: index });
                                }
                            }}
                        >
                            {rule.native.cron}
                        </span>
                    ) : (
                        <TextField
                            disabled={!!error || !rule.common.enabled}
                            title={I18n.t('parser_Leave it empty if default interval is desired')}
                            style={{ width: 'calc(100% - 42px)', verticalAlign: 'middle' }}
                            value={rule.native.interval}
                            type="number"
                            onChange={e => this._onChange(index, true, 'interval', e.target.value)}
                            variant="standard"
                        />
                    )}
                </TableCell>
                <TableCell style={styles.cell}>
                    <IconButton
                        size="small"
                        disabled={!!error || !rule.common.enabled}
                        onClick={() => this.setState({ showEditDialog: this.state.rules![index] })}
                    >
                        <Edit />
                    </IconButton>
                    <IconButton
                        size="small"
                        onClick={() => this.setState({ showDeleteDialog: index })}
                    >
                        <Delete />
                    </IconButton>
                    {this.renderCloneButton(rule, index, !!error || !rule.common.enabled)}
                </TableCell>
            </TableRow>
        );
    }

    renderSelectIdDialog(): React.JSX.Element | null {
        if (this.state.showSelectIdDialog === null || !this.state.rules) {
            return null;
        }
        const index = this.state.showSelectIdDialog;
        const rule = this.state.rules[index];
        return (
            <DialogSelectID
                key="selectId"
                imagePrefix="../.."
                dialogName="parser"
                themeType={this.props.oContext.themeType}
                theme={this.props.oContext.theme}
                socket={this.props.oContext.socket as any}
                selected={rule.native.link}
                onClose={() => this.setState({ showSelectIdDialog: null })}
                onOk={(selected: string | string[] | undefined) => {
                    if (typeof selected === 'string') {
                        this._onChange(index, true, 'link', selected);
                    }
                    this.setState({ showSelectIdDialog: null });
                }}
            />
        );
    }

    renderSelectFileDialog(): React.JSX.Element | null {
        if (this.state.showSelectFileDialog === null || !this.state.rules) {
            return null;
        }
        const index = this.state.showSelectFileDialog;
        const rule = this.state.rules[index];
        return (
            <DialogSelectFile
                key="selectFile"
                dialogName="parser"
                themeType={this.props.oContext.themeType}
                theme={this.props.oContext.theme}
                socket={this.props.oContext.socket as any}
                selected={rule.native.link}
                onClose={() => this.setState({ showSelectFileDialog: null })}
                onOk={(selected: string | string[] | undefined) => {
                    if (typeof selected === 'string') {
                        this._onChange(index, true, 'link', selected);
                    }
                    this.setState({ showSelectFileDialog: null });
                }}
            />
        );
    }

    renderDeleteDialog(): React.JSX.Element | null {
        if (this.state.showDeleteDialog === null) {
            return null;
        }
        return (
            <Confirm
                text={I18n.t('parser_Delete rule')}
                ok={I18n.t('ra_Delete')}
                onClose={result => {
                    if (result) {
                        const id: string = this.state.rules![this.state.showDeleteDialog!]._id;
                        const rules: ParserRule[] = JSON.parse(JSON.stringify(this.state.rules));
                        rules.splice(this.state.showDeleteDialog!, 1);
                        this.setState({ rules, showDeleteDialog: null }, async () => {
                            id && (await this.props.oContext.socket.delObject(id));
                        });
                    } else {
                        this.setState({ showDeleteDialog: null });
                    }
                }}
            />
        );
    }

    renderCronDialog(): React.JSX.Element | null {
        if (this.state.showCronDialog === null || !this.state.rules) {
            return null;
        }
        const index = this.state.showCronDialog;
        if (index < 0 || index >= this.state.rules.length) {
            return null;
        }
        const rule = this.state.rules[index];
        return (
            <DialogCron
                key="cronDialog"
                noWizard
                cron={rule.native.cron || '* * * * *'}
                theme={this.props.oContext.theme}
                onOk={cron => {
                    this._onChange(index, true, 'cron', cron);
                    this.setState({ showCronDialog: null });
                }}
                onClose={() => this.setState({ showCronDialog: null })}
            />
        );
    }

    renderCard(rule: ParserRule, index: number): React.JSX.Element {
        const error =
            !rule.common.name || !!this.state.rules?.find((r, i) => r.common.name === rule.common.name && i !== index);
        const disabled = error || !rule.common.enabled;
        const isNumber = rule.common.type === 'number';

        return (
            <Paper
                key={`${index}_${rule._id}`}
                style={{
                    ...styles.cardPaper,
                    ...(this.state.changed.includes(index) ? styles.changedRow : undefined),
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <Checkbox
                        disabled={error}
                        checked={rule.common.enabled}
                        onChange={e => this._onChange(index, false, 'enabled', e.target.checked)}
                        size="small"
                    />
                    <TextField
                        value={rule.common.name}
                        error={error}
                        disabled={!rule.common.enabled}
                        onChange={e => {
                            const rules: ParserRule[] = JSON.parse(JSON.stringify(this.state.rules));
                            rules[index].common.name = e.target.value;
                            const err = this.checkError();
                            this.setState({ rules, error: err }, () => this.onAutoSave(index));
                        }}
                        variant="standard"
                        style={{ flex: 1 }}
                        label={I18n.t('parser_Name')}
                    />
                    <IconButton
                        size="small"
                        disabled={disabled}
                        onClick={() => this.setState({ showEditDialog: this.state.rules![index] })}
                    >
                        <Edit />
                    </IconButton>
                    <IconButton
                        size="small"
                        onClick={() => this.setState({ showDeleteDialog: index })}
                    >
                        <Delete />
                    </IconButton>
                    {this.renderCloneButton(rule, index, disabled)}
                </div>
                <Table size="small">
                    <TableBody>
                        <TableRow>
                            <TableCell style={styles.cardLabel}>{I18n.t('parser_Source')}</TableCell>
                            <TableCell style={styles.cardValue}>
                                {this.renderSourceField(rule, index, disabled)}
                            </TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell style={styles.cardLabel}>{I18n.t('parser_RegEx')}</TableCell>
                            <TableCell style={styles.cardValue}>
                                <TextField
                                    disabled={disabled}
                                    fullWidth
                                    value={rule.native.regex}
                                    onChange={e => this._onChange(index, true, 'regex', e.target.value)}
                                    variant="standard"
                                />
                            </TableCell>
                        </TableRow>
                        {rule.common.type !== 'array' ? (
                            <TableRow>
                                <TableCell style={styles.cardLabel}>{I18n.t('parser_Item')}</TableCell>
                                <TableCell style={styles.cardValue}>
                                    <TextField
                                        fullWidth
                                        disabled={disabled}
                                        value={rule.native.item}
                                        type="number"
                                        slotProps={{ htmlInput: { min: 0 } }}
                                        onChange={e => this._onChange(index, true, 'item', e.target.value)}
                                        variant="standard"
                                    />
                                </TableCell>
                            </TableRow>
                        ) : null}
                        <TableRow>
                            <TableCell style={styles.cardLabel}>{I18n.t('parser_Role')}</TableCell>
                            <TableCell style={styles.cardValue}>
                                <Select
                                    fullWidth
                                    disabled={disabled}
                                    value={rule.common.role || ''}
                                    onChange={e => this._onChange(index, false, 'role', e.target.value)}
                                    variant="standard"
                                >
                                    <MenuItem value="state">default</MenuItem>
                                    <MenuItem value="">custom</MenuItem>
                                    <MenuItem value="temperature">temperature</MenuItem>
                                    <MenuItem value="value">value</MenuItem>
                                    <MenuItem value="blinds">blinds</MenuItem>
                                    <MenuItem value="switch">switch</MenuItem>
                                    <MenuItem value="indicator">indicator</MenuItem>
                                </Select>
                            </TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell style={styles.cardLabel}>{I18n.t('parser_Type')}</TableCell>
                            <TableCell style={styles.cardValue}>
                                <Select
                                    fullWidth
                                    disabled={disabled}
                                    value={rule.common.type || 'string'}
                                    onChange={e => this._onChange(index, false, 'type', e.target.value)}
                                    variant="standard"
                                >
                                    <MenuItem value="boolean">boolean</MenuItem>
                                    <MenuItem value="number">number</MenuItem>
                                    <MenuItem value="string">string</MenuItem>
                                    <MenuItem value="json">json</MenuItem>
                                </Select>
                            </TableCell>
                        </TableRow>
                        {isNumber ? (
                            <TableRow>
                                <TableCell style={styles.cardLabel}>{I18n.t('parser_Comma')}</TableCell>
                                <TableCell style={styles.cardValue}>
                                    <Checkbox
                                        disabled={disabled}
                                        checked={!!rule.native.comma}
                                        onChange={e => this._onChange(index, true, 'comma', e.target.checked)}
                                    />
                                </TableCell>
                            </TableRow>
                        ) : null}
                        {isNumber ? (
                            <TableRow>
                                <TableCell style={styles.cardLabel}>{I18n.t('parser_Unit')}</TableCell>
                                <TableCell style={styles.cardValue}>
                                    <TextField
                                        fullWidth
                                        disabled={disabled}
                                        value={rule.common.unit}
                                        onChange={e => this._onChange(index, false, 'unit', e.target.value)}
                                        variant="standard"
                                    />
                                </TableCell>
                            </TableRow>
                        ) : null}
                        <TableRow>
                            <TableCell
                                style={styles.cardLabel}
                                title={I18n.t('parser_If new value is not available, let old value unchanged')}
                            >
                                {I18n.t('parser_Old')}
                            </TableCell>
                            <TableCell style={styles.cardValue}>
                                <Checkbox
                                    disabled={disabled}
                                    checked={!!rule.native.substituteOld}
                                    onChange={e => this._onChange(index, true, 'substituteOld', e.target.checked)}
                                />
                            </TableCell>
                        </TableRow>
                        {!rule.native.substituteOld ? (
                            <TableRow>
                                <TableCell
                                    style={styles.cardLabel}
                                    title={I18n.t('parser_If new value is not available, use this value')}
                                >
                                    {I18n.t('parser_Subs')}
                                </TableCell>
                                <TableCell style={styles.cardValue}>
                                    <TextField
                                        disabled={disabled}
                                        fullWidth
                                        value={rule.native.substitute}
                                        onChange={e => this._onChange(index, true, 'substitute', e.target.value)}
                                        variant="standard"
                                    />
                                </TableCell>
                            </TableRow>
                        ) : null}
                        {isNumber ? (
                            <TableRow>
                                <TableCell style={styles.cardLabel}>{I18n.t('parser_Factor')}</TableCell>
                                <TableCell style={styles.cardValue}>
                                    <TextField
                                        disabled={disabled}
                                        fullWidth
                                        value={rule.native.factor}
                                        onChange={e => this._onChange(index, true, 'factor', e.target.value)}
                                        variant="standard"
                                    />
                                </TableCell>
                            </TableRow>
                        ) : null}
                        {isNumber ? (
                            <TableRow>
                                <TableCell style={styles.cardLabel}>{I18n.t('parser_Offset')}</TableCell>
                                <TableCell style={styles.cardValue}>
                                    <TextField
                                        disabled={disabled}
                                        fullWidth
                                        value={rule.native.offset}
                                        onChange={e => this._onChange(index, true, 'offset', e.target.value)}
                                        variant="standard"
                                    />
                                </TableCell>
                            </TableRow>
                        ) : null}
                        <TableRow>
                            <TableCell style={styles.cardLabel}>
                                <Tooltip title={I18n.t('parser_Use cron expression')}>
                                    <Checkbox
                                        size="small"
                                        disabled={disabled}
                                        checked={!!rule.native.cron}
                                        onChange={e => {
                                            if (e.target.checked) {
                                                this.setState({ showCronDialog: index });
                                            } else {
                                                this._onChange(index, true, 'cron', '');
                                            }
                                        }}
                                    />
                                </Tooltip>
                                {rule.native.cron ? I18n.t('parser_Cron') : I18n.t('parser_Interval')}
                            </TableCell>
                            <TableCell style={styles.cardValue}>
                                {rule.native.cron ? (
                                    <span
                                        style={{
                                            cursor: disabled ? 'default' : 'pointer',
                                            textDecoration: 'underline',
                                            opacity: disabled ? 0.5 : 1,
                                        }}
                                        onClick={() => {
                                            if (!disabled) {
                                                this.setState({ showCronDialog: index });
                                            }
                                        }}
                                    >
                                        {rule.native.cron}
                                    </span>
                                ) : (
                                    <TextField
                                        disabled={disabled}
                                        title={I18n.t('parser_Leave it empty if default interval is desired')}
                                        fullWidth
                                        value={rule.native.interval}
                                        type="number"
                                        onChange={e => this._onChange(index, true, 'interval', e.target.value)}
                                        variant="standard"
                                    />
                                )}
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </Paper>
        );
    }

    renderCards(): React.JSX.Element {
        return (
            <div style={{ padding: 8 }}>
                {this.state.rules!.map((rule, index) => this.renderCard(rule, index))}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
                    <Fab
                        size="small"
                        color="primary"
                        onClick={() => this.onAddRule()}
                    >
                        <Add />
                    </Fab>
                    {this.renderToolbarButtons()}
                </div>
            </div>
        );
    }

    renderTable(): React.JSX.Element {
        const anyNumber = !!this.state.rules!.find(it => it.common.type === 'number');
        const anySubstituteOld = !!this.state.rules!.find(it => !it.native.substituteOld);
        const anyNotArray = !!this.state.rules!.find(it => it.common.type !== 'array');

        return (
            <TableContainer component={Paper}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell style={{ ...styles.cell, ...styles.colIndex }}></TableCell>
                            <TableCell style={{ ...styles.cell, ...styles.colActive }}>
                                {I18n.t('parser_Active')}
                            </TableCell>
                            <TableCell style={{ ...styles.cell, ...styles.colName }}>{I18n.t('parser_Name')}</TableCell>
                            <TableCell style={{ ...styles.cell, ...styles.colUrl }}>
                                {I18n.t('parser_Source')}
                            </TableCell>
                            <TableCell style={{ ...styles.cell, ...styles.colRegEx }}>
                                {I18n.t('parser_RegEx')}
                            </TableCell>
                            {anyNotArray ? (
                                <TableCell style={{ ...styles.cell, ...styles.colItem }}>
                                    {I18n.t('parser_Item')}
                                </TableCell>
                            ) : null}
                            <TableCell style={{ ...styles.cell, ...styles.colRole }}>{I18n.t('parser_Role')}</TableCell>
                            <TableCell style={{ ...styles.cell, ...styles.colType }}>{I18n.t('parser_Type')}</TableCell>
                            {anyNumber ? (
                                <TableCell style={{ ...styles.cell, ...styles.colComma }}>
                                    {I18n.t('parser_Comma')}
                                </TableCell>
                            ) : null}
                            {anyNumber ? (
                                <TableCell style={{ ...styles.cell, ...styles.colUnit }}>
                                    {I18n.t('parser_Unit')}
                                </TableCell>
                            ) : null}
                            <TableCell
                                style={{ ...styles.cell, ...styles.colSubstituteOld }}
                                title={I18n.t('parser_If new value is not available, let old value unchanged')}
                            >
                                {I18n.t('parser_Old')}
                            </TableCell>
                            {anySubstituteOld ? (
                                <TableCell
                                    style={{ ...styles.cell, ...styles.colSubstitute }}
                                    title={I18n.t('parser_If new value is not available, use this value')}
                                >
                                    {I18n.t('parser_Subs')}
                                </TableCell>
                            ) : null}
                            {anyNumber ? (
                                <TableCell style={{ ...styles.cell, ...styles.colFactor }}>
                                    {I18n.t('parser_Factor')}
                                </TableCell>
                            ) : null}
                            {anyNumber ? (
                                <TableCell style={{ ...styles.cell, ...styles.colOffset }}>
                                    {I18n.t('parser_Offset')}
                                </TableCell>
                            ) : null}
                            <TableCell
                                style={{ ...styles.cell, ...styles.colInterval }}
                                title={I18n.t('parser_Cron expression as alternative to interval')}
                            >
                                {I18n.t('parser_Interval')}/{I18n.t('parser_Cron')}
                            </TableCell>
                            <TableCell style={{ ...styles.cell, ...styles.colButtons }}>
                                <Fab
                                    size="small"
                                    color="primary"
                                    onClick={() => this.onAddRule()}
                                >
                                    <Add />
                                </Fab>
                                {this.renderToolbarButtons()}
                            </TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {this.state.rules!.map((rule, index) =>
                            this.renderRule(rule, index, anyNumber, anySubstituteOld, anyNotArray),
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        );
    }

    renderItem(): React.JSX.Element {
        if (!this.state.rules) {
            return <LinearProgress />;
        }

        const isNarrow = this.getCurrentBreakpoint() === 'xs';

        return (
            <div
                ref={this.refDiv}
                style={{ width: '100%' }}
            >
                <style>
                    {`
@keyframes admin-parser-blink {
    0% {
        color: #00FF00;
    }
    100% {
        color: ${this.props.oContext.themeType === 'dark' ? '#fff' : '#000'};
    }
}
`}
                </style>
                <input
                    ref={this.fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    style={{ display: 'none' }}
                    onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) {
                            return;
                        }
                        const reader = new FileReader();
                        reader.onload = ev => this.importRules(ev.target?.result as string);
                        reader.readAsText(file);
                        e.target.value = '';
                    }}
                />
                {this.state.showEditDialog ? (
                    <EditDialog
                        rule={this.state.showEditDialog}
                        logSources={this.state.logSources}
                        theme={this.props.oContext.theme}
                        onClose={() => this.setState({ showEditDialog: null })}
                        onSave={editedRule => {
                            const rules: ParserRule[] = JSON.parse(JSON.stringify(this.state.rules));
                            const index = rules.findIndex(r => r._id === editedRule._id);
                            if (index === -1) {
                                this.setState({ showEditDialog: null });
                                return;
                            }
                            Object.assign(rules[index].common, editedRule.common);
                            Object.assign(rules[index].native, editedRule.native);
                            this.setState({ showEditDialog: null, rules }, () => this.onAutoSave(index));
                        }}
                        fetchText={() =>
                            this.fetchText(
                                this.state.showEditDialog!.native.link,
                                this.state.showEditDialog!.native.type,
                            )
                        }
                    />
                ) : null}
                {this.renderDeleteDialog()}
                {this.renderSelectIdDialog()}
                {this.renderSelectFileDialog()}
                {this.renderCronDialog()}
                {isNarrow ? this.renderCards() : this.renderTable()}
            </div>
        );
    }
}
