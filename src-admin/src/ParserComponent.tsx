import React from 'react';

import {
    TableContainer,
    TableHead,
    Table,
    TableBody,
    TableRow,
    TableCell,
    Paper,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    Checkbox,
    IconButton,
    Select,
    MenuItem,
    LinearProgress,
    Grid,
    FormControlLabel,
    FormControl,
    InputLabel,
    Fab,
} from '@mui/material';

import { Save, Close, Edit, Delete, ContentCopy, PlayArrow, Add } from '@mui/icons-material';

// important to make from package and not from some children.
// invalid
// import Confirm from '@iobroker/adapter-react-v5/Confirm';
// valid
import { I18n, Confirm, type IobTheme } from '@iobroker/adapter-react-v5';
import { ConfigGeneric, type ConfigGenericProps, type ConfigGenericState } from '@iobroker/json-config';

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
        width: 50,
    },
    colButtons: {
        width: 140,
        textAlign: 'right',
    },
    changedRow: {
        backgroundColor: '#795d5d',
    },
    marginRight: {
        marginRight: 10,
    },
    item: {
        width: 50,
        marginLeft: 10,
    },
    regex: {
        width: 'calc(100% - 100px)',
    },
    dialog: {
        // height: 'calc(100% - 50px)',
    },
    testText: (theme: IobTheme): any => ({
        '& textarea': {
            width: '100%',
            height: 150,
            resize: 'none',
            backgroundColor: theme.palette.mode === 'dark' ? '#333' : '#fff',
            color: theme.palette.mode === 'dark' ? '#fff' : '#000',
        },
    }),
    input: {
        width: 100,
    },
    resultUpdated: (theme: IobTheme): any => ({
        '& label': {
            color: theme.palette.mode === 'dark' ? '#fff' : '#000',
            animation: `admin-parser-blink 1000ms ease-in-out`,
        },
        '& input': {
            color: theme.palette.mode === 'dark' ? '#fff' : '#000',
            animation: `admin-parser-blink 1000ms ease-in-out`,
        },
    }),
};

interface ParserCommon extends ioBroker.StateCommon {
    enabled?: boolean;
}

interface ParserState extends ioBroker.StateObject {
    common: ParserCommon;
}

interface ParserRule {
    _id: string;
    common: {
        name: string;
        enabled: boolean;
        role?: string;
        type: ioBroker.CommonType;
        unit?: string;
        read?: boolean;
        write?: boolean;
    };
    native: {
        link: string;
        item: number | string;
        regex: string;
        interval: number | string;
        substitute: string | null | number | boolean | undefined;
        substituteOld: string | null | number | boolean | undefined;
        offset: number | string;
        factor: number | string;
        parseHtml: boolean | 'true';
        comma?: boolean;
    };
}

interface ParserComponentState extends ConfigGenericState {
    showEditDialog: ParserRule | null;
    error: false | number;
    testText: string;
    testResult: string | number | boolean;
    resultIndex: number;
    alive: boolean;
    rules: ParserRule[] | null;
    showDeleteDialog: null | number;
    changed: number[];
    testError: string;
    originalRule: string;
}

class ParserComponent extends ConfigGeneric<ConfigGenericProps, ParserComponentState> {
    private readonly namespace: string;
    private readonly testTextRef: React.RefObject<HTMLTextAreaElement>;
    private timerTest: ReturnType<typeof setTimeout> | null = null;
    private saveTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(props: ConfigGenericProps) {
        super(props);
        this.state = {
            ...this.state,
            showEditDialog: null,
            rules: null,
            error: false,
            showDeleteDialog: null,
            testText: 'Test text',
            testResult: '',
            testError: '',
            changed: [],
            resultIndex: 0,
            alive: false,
            originalRule: '',
        };
        this.namespace = `${this.props.oContext.adapterName}.${this.props.oContext.instance}.`;
        this.testTextRef = React.createRef();
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
                    link: state.native.link,
                    item: state.native.item || 0,
                    regex: state.native.regex,
                    interval: state.native.interval,
                    substitute: state.native.substitute,
                    substituteOld: state.native.substituteOld,
                    offset: state.native.offset,
                    factor: state.native.factor,
                    parseHtml: state.native.parseHtml,
                },
            };
        });
        rules.sort((a, b) => a.common.name.localeCompare(b.common.name));

        this.setState({ rules, alive: state ? (state.val as boolean) : false });
        await this.props.oContext.socket.subscribeObject(`${this.namespace}*`, this.onObjectChange);
        await this.props.oContext.socket.subscribeState(`system.adapter.${this.namespace}*`, this.onAliveChange);
    }

    async componentWillUnmount(): Promise<void> {
        await this.props.oContext.socket.unsubscribeObject(`${this.namespace}*`, this.onObjectChange);
        this.props.oContext.socket.unsubscribeState(`system.adapter.${this.namespace}*`, this.onAliveChange);
        this.timerTest && clearTimeout(this.timerTest);
        this.timerTest = null;
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
                        write: false,
                    },
                    native: {
                        link: obj.native.link,
                        item: obj.native.item || 0,
                        regex: obj.native.regex,
                        interval: obj.native.interval,
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
                console.log('Detected change');
                console.log(`old: ${JSON.stringify(this.state.rules![ruleIndex])}`);
                console.log(`new: ${JSON.stringify(rules[ruleIndex])}`);
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
                        link: obj.native.link,
                        item: obj.native.item || 0,
                        regex: obj.native.regex,
                        interval: obj.native.interval,
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

    requestData(link: string): void {
        if (this.state.alive) {
            this.props.oContext.socket
                .sendTo(`${this.props.oContext.adapterName}.${this.props.oContext.instance}`, 'link', link)
                .then(result => {
                    if (result) {
                        if (result.error) {
                            window.alert(result.error);
                        } else {
                            this.setState({ testText: result.text || '' });
                        }
                    }
                });
        }
    }

    renderEditDialog(): React.JSX.Element | null {
        if (!this.state.showEditDialog) {
            return null;
        }

        const rule = this.state.showEditDialog;
        return (
            <Dialog
                key="dialog"
                maxWidth="lg"
                fullWidth
                open={!0}
                onClose={() => {}}
                sx={{ '& .MuiDialog-paper': styles.dialog }}
            >
                <DialogTitle>
                    {I18n.t('parser_Test regex')}:
                    <span style={{ fontStyle: 'italic', fontWeight: 'bold', marginLeft: 10 }}>
                        {this.state.showEditDialog.common.name}
                    </span>
                </DialogTitle>
                <DialogContent>
                    <Grid
                        container
                        spacing={2}
                    >
                        <Grid
                            item
                            sm={12}
                        >
                            <FormControl
                                variant="standard"
                                style={styles.marginRight}
                            >
                                <InputLabel>{I18n.t('parser_Type')}</InputLabel>
                                <Select
                                    value={rule.common.type || 'string'}
                                    onChange={e => {
                                        const newRule: ParserRule = JSON.parse(JSON.stringify(rule));
                                        newRule.common.type = e.target.value as ioBroker.CommonType;
                                        this.setState({ showEditDialog: newRule }, () => this.onTest());
                                    }}
                                    variant="standard"
                                >
                                    <MenuItem value="boolean">boolean</MenuItem>
                                    <MenuItem value="number">number</MenuItem>
                                    <MenuItem value="string">string</MenuItem>
                                    <MenuItem value="json">json</MenuItem>
                                    <MenuItem value="array">array</MenuItem>
                                </Select>
                            </FormControl>
                            {rule.common.type === 'number' ? (
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={!!rule.native.substituteOld}
                                            onChange={() => {
                                                const newRule: ParserRule = JSON.parse(JSON.stringify(rule));
                                                newRule.native.comma = !newRule.native.comma;
                                                this.setState({ showEditDialog: newRule }, () => this.onTest());
                                            }}
                                        />
                                    }
                                    label={I18n.t('parser_Comma')}
                                />
                            ) : null}
                        </Grid>
                        <Grid
                            item
                            sm={12}
                        >
                            <FormControlLabel
                                title={I18n.t('parser_If new value is not available, let old value unchanged')}
                                style={styles.marginRight}
                                control={
                                    <Checkbox
                                        checked={!!rule.native.substituteOld}
                                        onChange={() => {
                                            const newRule: ParserRule = JSON.parse(JSON.stringify(rule));
                                            newRule.native.substituteOld = !newRule.native.substituteOld;
                                            this.setState({ showEditDialog: newRule }, () => this.onTest());
                                        }}
                                    />
                                }
                                label={I18n.t('parser_Substitute old value')}
                            />
                            {!rule.native.substituteOld ? (
                                <TextField
                                    title={I18n.t('parser_If new value is not available, use this value')}
                                    style={{ ...styles.marginRight, ...styles.input }}
                                    value={rule.native.substitute || ''}
                                    onChange={e => {
                                        const newRule: ParserRule = JSON.parse(JSON.stringify(rule));
                                        newRule.native.substitute = e.target.value;
                                        this.setState({ showEditDialog: newRule }, () => this.onTest());
                                    }}
                                    label={I18n.t('parser_Substitute value')}
                                    variant="standard"
                                />
                            ) : null}

                            {rule.common.type === 'number' ? (
                                <TextField
                                    style={{ ...styles.marginRight, ...styles.input }}
                                    value={rule.native.factor || 1}
                                    onChange={e => {
                                        const newRule: ParserRule = JSON.parse(JSON.stringify(rule));
                                        newRule.native.factor = e.target.value;
                                        this.setState({ showEditDialog: newRule }, () => this.onTest());
                                    }}
                                    variant="standard"
                                    label={I18n.t('parser_Factor')}
                                />
                            ) : null}
                            {rule.common.type === 'number' ? (
                                <TextField
                                    style={{ ...styles.marginRight, ...styles.input }}
                                    value={rule.native.offset || 0}
                                    onChange={e => {
                                        const newRule: ParserRule = JSON.parse(JSON.stringify(rule));
                                        newRule.native.offset = e.target.value;
                                        this.setState({ showEditDialog: newRule }, () => this.onTest());
                                    }}
                                    label={I18n.t('parser_Offset')}
                                    variant="standard"
                                />
                            ) : null}
                            {rule.common.type === 'string' ? (
                                <FormControlLabel
                                    title={I18n.t('parser_Convert &#48; => 0 and so on')}
                                    style={styles.marginRight}
                                    control={
                                        <Checkbox
                                            checked={!!rule.native.parseHtml}
                                            onChange={() => {
                                                const newRule: ParserRule = JSON.parse(JSON.stringify(rule));
                                                newRule.native.parseHtml = !newRule.native.parseHtml;
                                                this.setState({ showEditDialog: newRule }, () => this.onTest());
                                            }}
                                        />
                                    }
                                    label={I18n.t('parser_Parse HTML text')}
                                />
                            ) : null}
                        </Grid>
                        <Grid
                            item
                            sm={12}
                        >
                            <TextField
                                value={rule.native.regex || ''}
                                onChange={e => {
                                    const newRule: ParserRule = JSON.parse(JSON.stringify(rule));
                                    newRule.native.regex = e.target.value;
                                    this.setState({ showEditDialog: newRule }, () => this.onTest());
                                }}
                                variant="standard"
                                style={styles.regex}
                                label={I18n.t('parser_RegEx')}
                            />
                            {rule.common.type !== 'array' ? (
                                <TextField
                                    value={rule.native.item || 0}
                                    type="number"
                                    slotProps={{
                                        htmlInput: {
                                            min: 0,
                                        },
                                    }}
                                    onChange={e => {
                                        const newRule: ParserRule = JSON.parse(JSON.stringify(rule));
                                        newRule.native.item = e.target.value;
                                        this.setState({ showEditDialog: newRule }, () => this.onTest());
                                    }}
                                    variant="standard"
                                    style={styles.item}
                                    label={I18n.t('parser_Item')}
                                />
                            ) : null}
                            <Fab
                                color="primary"
                                size="small"
                                onClick={() => this.onTest(true)}
                            >
                                <PlayArrow />
                            </Fab>
                        </Grid>
                        <Grid
                            item
                            sm={12}
                            sx={styles.testText}
                        >
                            <textarea
                                ref={this.testTextRef}
                                value={this.state.testText}
                                onChange={e => this.setState({ testText: e.target.value }, () => this.onTest())}
                            />
                        </Grid>
                        <Grid
                            item
                            sm={12}
                        >
                            <TextField
                                sx={styles.resultUpdated}
                                key={this.state.resultIndex}
                                variant="standard"
                                label={I18n.t('parser_Result')}
                                value={this.state.testResult.toString()}
                                slotProps={{
                                    htmlInput: {
                                        readOnly: true,
                                    },
                                }}
                                fullWidth
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button
                        disabled={JSON.stringify(this.state.showEditDialog) === this.state.originalRule}
                        onClick={() => {
                            const rules: ParserRule[] = JSON.parse(JSON.stringify(this.state.rules));
                            const index = rules.findIndex(r => r._id === rule._id);
                            Object.assign(rules[index].common, this.state.showEditDialog!.common);
                            Object.assign(rules[index].native, this.state.showEditDialog!.native);
                            this.setState({ showEditDialog: null, originalRule: '', rules }, () =>
                                this.onAutoSave(index),
                            );
                        }}
                        color="primary"
                        startIcon={<Save />}
                        variant="contained"
                    >
                        {I18n.t('ra_Save')}
                    </Button>
                    <Button
                        color="grey"
                        onClick={() => this.setState({ showEditDialog: null, originalRule: '' })}
                        variant="contained"
                        startIcon={<Close />}
                    >
                        {I18n.t('ra_Cancel')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
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
                    <TextField
                        fullWidth
                        disabled={!!error || !rule.common.enabled}
                        value={rule.native.link}
                        onChange={e => this._onChange(index, true, 'link', e.target.value)}
                        variant="standard"
                    />
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
                <TableCell
                    title={I18n.t('parser_Leave it empty if default interval is desired')}
                    style={styles.cell}
                >
                    <TextField
                        disabled={!!error || !rule.common.enabled}
                        fullWidth
                        value={rule.native.interval}
                        type="number"
                        onChange={e => this._onChange(index, true, 'interval', e.target.value)}
                        variant="standard"
                    />
                </TableCell>
                <TableCell style={styles.cell}>
                    <IconButton
                        size="small"
                        disabled={!!error || !rule.common.enabled}
                        onClick={() =>
                            this.setState(
                                {
                                    showEditDialog: JSON.parse(JSON.stringify(this.state.rules![index])),
                                    originalRule: JSON.stringify(this.state.rules![index]),
                                },
                                () => this.requestData(this.state.rules![index].native.link),
                            )
                        }
                    >
                        <Edit />
                    </IconButton>
                    <IconButton
                        size="small"
                        onClick={() => this.setState({ showDeleteDialog: index })}
                    >
                        <Delete />
                    </IconButton>
                    <IconButton
                        size="small"
                        disabled={!!error || !rule.common.enabled}
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
                                common: rule.common as ioBroker.StateCommon,
                                native: rule.native,
                            });
                        }}
                    >
                        <ContentCopy />
                    </IconButton>
                </TableCell>
            </TableRow>
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

    onTest(immediately?: boolean): void {
        this.timerTest && clearTimeout(this.timerTest);
        if (this.state.showEditDialog) {
            this.timerTest = setTimeout(
                () => {
                    if (!this.state.showEditDialog) {
                        return;
                    }
                    let test = this.state.testText;
                    let regex = this.state.showEditDialog.native.regex;
                    const type = this.state.showEditDialog.common.type;
                    const comma = this.state.showEditDialog.native.comma;
                    const offsetStr = this.state.showEditDialog.native.offset;
                    const itemStr = this.state.showEditDialog.native.item;
                    const factorStr = this.state.showEditDialog.native.factor;
                    const parseHtml =
                        this.state.showEditDialog.native.parseHtml === 'true' ||
                        this.state.showEditDialog.native.parseHtml === true;
                    let substitute = this.state.showEditDialog.native.substitute;

                    if (!regex) {
                        regex = '.+';
                    }

                    if (regex[0] === '/') {
                        regex = regex.substring(1, regex.length - 1);
                    }

                    if (substitute !== '' && substitute !== undefined && substitute !== null) {
                        if (substitute === 'null') {
                            substitute = null;
                        }

                        if (type === 'number') {
                            substitute = parseFloat(substitute as string) || 0;
                        } else if (type === 'boolean') {
                            if (substitute === 'true') {
                                substitute = true;
                            }
                            if (substitute === 'false') {
                                substitute = false;
                            }
                            substitute = !!substitute;
                        }
                    } else {
                        substitute = undefined;
                    }
                    let regExpression;
                    try {
                        regExpression = new RegExp(regex, itemStr || type === 'array' ? 'g' : '');
                    } catch (e) {
                        this.setState({ testError: (e as Error).toString() });
                        return;
                    }
                    const offset = parseFloat(offsetStr as string) || 0;
                    const factor = parseFloat(factorStr as string) || 1;
                    let item = (parseInt(itemStr as string, 10) || 0) + 1;
                    if (item < 0) {
                        item = 1;
                    }
                    if (item > 1000) {
                        item = 1000;
                    }
                    test = (test || '').toString().replace(/\r\n|[\r\n]/g, ' ');
                    let m: RegExpMatchArray | null;
                    if (type === 'array') {
                        m = test.match(regExpression);
                    } else {
                        do {
                            m = regExpression.exec(test);
                            item--;
                        } while (item && m);
                    }

                    if (m) {
                        let newVal;

                        if (type === 'boolean') {
                            newVal = 'true';
                        } else if (type !== 'array') {
                            newVal = m.length > 1 ? m[1] : m[0];
                            if (type === 'number') {
                                // 1,000,000 => 1000000
                                if (!comma) {
                                    newVal = newVal.replace(/,/g, '');
                                } else {
                                    // 1.000.000 => 1000000
                                    newVal = newVal.replace(/\./g, '');
                                    // 5,67 => 5.67
                                    newVal = newVal.replace(',', '.');
                                }
                                // 1 000 000 => 1000000
                                newVal = newVal.replace(/\s/g, '');
                                newVal = parseFloat(newVal);
                                newVal *= factor;
                                newVal += offset;
                            }
                        } else {
                            // extract from string the value
                            if (regex.includes('(')) {
                                const _regExpression = new RegExp(regex);
                                m = m?.map(it => {
                                    const _m = it.match(_regExpression);
                                    if (_m && _m[1]) {
                                        return _m[1];
                                    }
                                    return it;
                                }) as RegExpMatchArray;
                            }
                            if (parseHtml) {
                                newVal = JSON.stringify(
                                    m?.map(it => it.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))),
                                );
                            } else {
                                newVal = JSON.stringify(m);
                            }
                        }

                        if (parseHtml && type === 'string') {
                            // replace &#48 with 0 and so on
                            newVal = newVal === null || newVal === undefined ? '' : newVal.toString();
                            newVal = newVal.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
                        }

                        this.setState(
                            {
                                testResult: newVal === null || newVal === undefined ? '' : newVal,
                                resultIndex: this.state.resultIndex + 1,
                            },
                            () => {
                                if (m) {
                                    // find position of the text
                                    const ll = m[1] ? m[0].indexOf(m[1]) : 0;
                                    // highlight text
                                    const el = this.testTextRef.current;
                                    const start = (m.index || 0) + ll;
                                    const end = (m.index || 0) + ll + (m[1] ? m[1].length : m[0].length);
                                    if (el?.setSelectionRange) {
                                        el.focus();

                                        const fullText = el.value;
                                        el.value = fullText.substring(0, end);
                                        const height = el.scrollHeight;
                                        el.scrollTop = height;
                                        el.value = fullText;
                                        el.scrollTop = height - 30;

                                        el?.setSelectionRange(start, end);
                                        // @ts-expect-error legacy
                                    } else if (el?.createTextRange) {
                                        // @ts-expect-error legacy
                                        const range = el.createTextRange();
                                        range.collapse(true);
                                        range.moveEnd('character', end);
                                        range.moveStart('character', start);
                                        range.select();
                                    } else if (el?.selectionStart) {
                                        el.selectionStart = start;
                                        el.selectionEnd = end;
                                    }
                                }
                            },
                        );
                    } else {
                        if (type === 'boolean') {
                            this.setState({
                                testResult: 'false',
                                resultIndex: this.state.resultIndex + 1,
                            });
                        } else {
                            this.setState({
                                testResult: substitute === null || substitute === undefined ? '' : substitute,
                                resultIndex: this.state.resultIndex + 1,
                            });
                        }
                    }
                },
                immediately ? 0 : 1000,
            );
        }
    }

    renderItem(): React.JSX.Element {
        if (!this.state.rules) {
            return <LinearProgress />;
        }

        const anyNumber = !!this.state.rules.find(it => it.common.type === 'number');
        const anySubstituteOld = !!this.state.rules.find(it => !it.native.substituteOld);
        const anyNotArray = !!this.state.rules.find(it => it.common.type !== 'array');

        return (
            <TableContainer component={Paper}>
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
                {this.renderEditDialog()}
                {this.renderDeleteDialog()}
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell style={{ ...styles.cell, ...styles.colIndex }}></TableCell>
                            <TableCell style={{ ...styles.cell, ...styles.colActive }}>
                                {I18n.t('parser_Active')}
                            </TableCell>
                            <TableCell style={{ ...styles.cell, ...styles.colName }}>{I18n.t('parser_Name')}</TableCell>
                            <TableCell style={{ ...styles.cell, ...styles.colUrl }}>
                                {I18n.t('parser_URL or file name')}
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
                                title={I18n.t('parser_Leave it empty if default interval is desired')}
                            >
                                {I18n.t('parser_Interval')}
                            </TableCell>
                            <TableCell style={{ ...styles.cell, ...styles.colButtons }}>
                                <Fab
                                    size="small"
                                    color="primary"
                                    onClick={() => {
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
                                                write: false,
                                            },
                                            native: {
                                                link: '',
                                                item: 0,
                                                regex: '',
                                                interval: '',
                                                substitute: '',
                                                substituteOld: true,
                                                offset: 0,
                                                factor: 1,
                                                parseHtml: false,
                                            },
                                        });
                                        this.setState({ rules });
                                    }}
                                >
                                    <Add />
                                </Fab>
                            </TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {this.state.rules.map((rule, index) =>
                            this.renderRule(rule, index, anyNumber, anySubstituteOld, anyNotArray),
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        );
    }
}

export default ParserComponent;
