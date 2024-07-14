import React from 'react';
import PropTypes from 'prop-types';

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

import {
    Save,
    Close,
    Edit,
    Delete,
    ContentCopy,
    PlayArrow,
    Add,
} from '@mui/icons-material';

// important to make from package and not from some children.
// invalid
// import Confirm from '@iobroker/adapter-react-v5/Confirm';
// valid
import { I18n, Confirm } from '@iobroker/adapter-react-v5';
import { ConfigGeneric } from '@iobroker/json-config';

const styles = {
    table: {
        minWidth: 400,
    },
    header: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    ok: {
        color: '#0ba20b'
    },
    warn: {
        color: '#f57d1d'
    },
    error: {
        color: '#c42c3a'
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
    colUrl: {

    },
    colRegEx: {

    },
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
    testText: theme => ({
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
    resultUpdated: theme => ({
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

class ParserComponent extends ConfigGeneric {
    constructor(props) {
        super(props);
        this.state = {
            showEditDialog: null,
            data: JSON.parse(JSON.stringify(props.data)),
            rules: null,
            error: null,
            showDeleteDialog: null,
            testText: 'Test text',
            testResult: '',
            changed: [],
            resultIndex: 0,
            alive: false,
        };
        this.namespace = `${this.props.adapterName}.${this.props.instance}.`;
        this.testTextRef = React.createRef();
    }

    componentDidMount() {
        super.componentDidMount();
        this.props.socket.getObjectViewSystem('state', this.namespace, `${this.namespace}\u9999`)
            .then(rows => this.props.socket.getState(`system.adapter.${this.namespace}alive`)
                .catch(() => null)
                .then(state => {
                    const rules = Object.keys(rows).map(id => ({
                        id,
                        name: id.substring(this.namespace.length),
                        common: {
                            enabled: rows[id].common.enabled !== false,
                            role: rows[id].common.role,
                            type: rows[id].common.type,
                            unit: rows[id].common.unit,
                        },
                        native: {
                            link: rows[id].native.link,
                            item: rows[id].native.item || 0,
                            regex: rows[id].native.regex,
                            interval: rows[id].native.interval,
                            substitute: rows[id].native.substitute,
                            substituteOld: rows[id].native.substituteOld,
                            offset: rows[id].native.offset,
                            factor: rows[id].native.factor,
                            parseHtml: rows[id].native.parseHtml,
                        },
                    }));
                    rules.sort((a, b) => a.name.localeCompare(b.name));

                    this.setState({ rules, alive: state ? state.val : false });
                    this.props.socket.subscribeObject(`${this.namespace}*`, this.onObjectChange);
                    this.props.socket.subscribeState(`system.adapter.${this.namespace}*`, this.onAliveChange);
                }));
    }

    componentWillUnmount() {
        this.props.socket.unsubscribeObject(`${this.namespace}*`, this.onObjectChange);
        this.props.socket.unsubscribeState(`system.adapter.${this.namespace}*`, this.onAliveChange);
        this.timerTest && clearTimeout(this.timerTest);
        this.timerTest = null;
    }

    onObjectChange = (id, obj) => {
        if (!id) {
            return;
        }
        const rules = JSON.parse(JSON.stringify(this.state.rules));
        const ruleIndex = rules.findIndex(rule => rule.id === id);
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
                    id,
                    name: id.substring(this.namespace.length),
                    common:        {
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
                };
                if (JSON.stringify(this.state.rules[ruleIndex]) === JSON.stringify(rules[ruleIndex])) {
                    return;
                }
            } else {
                // add new rule
                rules.push({
                    id,
                    name: id.substring(this.namespace.length),
                    common:        {
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
            rules.sort((a, b) => a.name.localeCompare(b.name));

            this.setState({ rules });
        }
    };

    onAliveChange = (id, state) => {
        if (id === `system.adapter.${this.namespace}alive` && this.state.alive !== (state && state.val || false)) {
            this.setState({ alive: state ? state.val : false });
        }
    }

    requestData(link) {
        if (this.state.alive) {
            this.props.socket.sendTo(`${this.props.adapterName}.${this.props.instance}`, 'link', link)
                .then(result => {
                    if (result) {
                        if (result.error) {
                            window.alert(result.error);
                        } else {
                            this.setState({ testText: result.text || ''});
                        }
                    }
                });
        }
    }

    renderEditDialog() {
        if (!this.state.showEditDialog) {
            return null;
        }

        const rule = this.state.showEditDialog;
        return <Dialog
            key="dialog"
            maxWidth="lg"
            fullWidth
            open={!0}
            onClose={() => {}}
            sx={{ '& .MuiDialog-paper': styles.dialog }}
        >
            <DialogTitle>
                {I18n.t('parser_Test regex')}:
                <span
                    style={{ fontStyle: 'italic', fontWeight: 'bold', marginLeft: 10 }}
                >
                    {this.state.showEditDialog.name}
                </span>
            </DialogTitle>
            <DialogContent>
                <Grid container spacing={2}>
                    <Grid item sm={12}>
                        <FormControl variant="standard" style={styles.marginRight}>
                            <InputLabel>{I18n.t('parser_Type')}</InputLabel>
                            <Select
                                value={rule.common.type || 'string'}
                                onChange={e => {
                                    const newRule = JSON.parse(JSON.stringify(rule));
                                    newRule.common.type = e.target.value;
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
                        {rule.common.type === 'number' ?
                            <FormControlLabel control={
                                <Checkbox
                                    checked={rule.native.substituteOld}
                                    onChange={() => {
                                        const newRule = JSON.parse(JSON.stringify(rule));
                                        newRule.native.comma = !newRule.native.comma;
                                        this.setState({ showEditDialog: newRule }, () => this.onTest());
                                    }}
                                />
                            } label={I18n.t('parser_Comma')} /> : null}
                    </Grid>
                    <Grid item sm={12}>
                        <FormControlLabel
                            title={I18n.t('parser_If new value is not available, let old value unchanged')}
                            style={styles.marginRight}
                            control={
                                <Checkbox
                                    checked={rule.native.substituteOld}
                                    onChange={() => {
                                        const newRule = JSON.parse(JSON.stringify(rule));
                                        newRule.native.substituteOld = !newRule.native.substituteOld;
                                        this.setState({ showEditDialog: newRule }, () => this.onTest());
                                    }}
                                />
                            }
                            label={I18n.t('parser_Substitute old value')}
                        />
                        {!rule.native.substituteOld ?
                            <TextField
                                title={I18n.t('parser_If new value is not available, use this value')}
                                style={{ ...styles.marginRight, ...styles.input }}
                                value={rule.native.substitute || ''}
                                onChange={e => {
                                    const newRule = JSON.parse(JSON.stringify(rule));
                                    newRule.native.substitute = e.target.value;
                                    this.setState({ showEditDialog: newRule }, () => this.onTest());
                                }}
                                label={I18n.t('parser_Substitute value')}
                                variant="standard"
                            /> : null}

                        {rule.common.type === 'number' ?
                            <TextField
                                style={{ ...styles.marginRight, ...styles.input }}
                                value={rule.native.factor || 1}
                                onChange={e => {
                                    const newRule = JSON.parse(JSON.stringify(rule));
                                    newRule.native.factor = e.target.value;
                                    this.setState({ showEditDialog: newRule }, () => this.onTest());
                                }}
                                variant="standard"
                                label={I18n.t('parser_Factor')}
                            /> : null}
                        {rule.common.type === 'number' ?
                            <TextField
                                style={{ ...styles.marginRight, ...styles.input }}
                                value={rule.native.offset || 0}
                                onChange={e => {
                                    const newRule = JSON.parse(JSON.stringify(rule));
                                    newRule.native.offset = e.target.value;
                                    this.setState({ showEditDialog: newRule }, () => this.onTest());
                                }}
                                label={I18n.t('parser_Offset')}
                                variant="standard"
                            /> : null}
                        {rule.common.type === 'string' ?
                            <FormControlLabel
                                title={I18n.t('parser_Convert &#48; => 0 and so on')}
                                style={styles.marginRight}
                                control={
                                    <Checkbox
                                        checked={rule.native.parseHtml}
                                        onChange={() => {
                                            const newRule = JSON.parse(JSON.stringify(rule));
                                            newRule.native.parseHtml = !newRule.native.parseHtml;
                                            this.setState({ showEditDialog: newRule }, () => this.onTest());
                                        }}
                                    />
                                }
                                label={I18n.t('parser_Parse HTML text')}
                            /> : null}
                    </Grid>
                    <Grid item sm={12}>
                        <TextField
                            value={rule.native.regex || ''}
                            onChange={e => {
                                const newRule = JSON.parse(JSON.stringify(rule));
                                newRule.native.regex = e.target.value;
                                this.setState({ showEditDialog: newRule }, () => this.onTest());
                            }}
                            variant="standard"
                            style={styles.regex}
                            label={I18n.t('parser_RegEx')}
                        />
                        {rule.common.type !== 'array' ? <TextField
                            value={rule.native.item || 0}
                            type="number"
                            min={0}
                            onChange={e => {
                                const newRule = JSON.parse(JSON.stringify(rule));
                                newRule.native.item = e.target.value;
                                this.setState({ showEditDialog: newRule }, () => this.onTest());
                            }}
                            variant="standard"
                            style={styles.item}
                            label={I18n.t('parser_Item')}
                        /> : null}
                        <Fab
                            color="primary"
                            size="small"
                            onClick={() => this.onTest(true)}
                        >
                            <PlayArrow />
                        </Fab>
                    </Grid>
                    <Grid item sm={12} sx={styles.testText}>
                        <textarea
                            ref={this.testTextRef}
                            value={this.state.testText}
                            onChange={e => this.setState({ testText: e.target.value }, () => this.onTest())}
                        />
                    </Grid>
                    <Grid item sm={12}>
                        <TextField
                            sx={styles.resultUpdated}
                            key={this.state.resultIndex}
                            variant="standard"
                            label={I18n.t('parser_Result')}
                            value={this.state.testResult.toString()}
                            readOnly
                            fullWidth
                        />
                    </Grid>
                </Grid>
            </DialogContent>
            <DialogActions>
                <Button
                    disabled={JSON.stringify(this.state.showEditDialog) === this.state.originalRule}
                    onClick={() => {
                        const rules = JSON.parse(JSON.stringify(this.state.rules));
                        const index = rules.findIndex(r => r.id === rule.id);
                        Object.assign(rules[index].common, this.state.showEditDialog.common);
                        Object.assign(rules[index].native, this.state.showEditDialog.native);
                        this.setState({ showEditDialog: null, originalRule: null, rules }, () =>
                            this.onAutoSave(index));
                    }}
                    color="primary"
                    startIcon={<Save />}
                    variant="contained"
                >
                    {I18n.t('ra_Save')}
                </Button>
                <Button
                    color="grey"
                    onClick={() => this.setState({ showEditDialog: null, originalRule: null })}
                    variant="contained"
                    startIcon={<Close />}
                >
                    {I18n.t('ra_Cancel')}
                </Button>
            </DialogActions>
        </Dialog>;
    }

    checkError() {
        // find empty ids
        const errorIndex = this.state.rules.findIndex(rule => !rule.name)
        if (errorIndex !== -1) {
            return errorIndex;
        }

        // find duplicate IDs
        for (let i = 0; i < this.state.rules.length; i++) {
            for (let j = i + 1; j < this.state.rules.length; j++) {
                if (this.state.rules[i].name === this.state.rules[j].name) {
                    return j;
                }
            }
        }
        return false;
    }

    onAutoSave(index) {
        const changed= [...this.state.changed];
        if (!changed.includes(index)) {
            changed.push(index);
            this.setState({ changed });
        }

        this.saveTimer && clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(async () => {
            this.saveTimer = null;
            for (let c = 0; c < this.state.changed.length; c++) {
                const _index = this.state.changed[c];
                const rule = this.state.rules[_index];

                if (rule.name && !this.state.rules.find((r, i) => r.name === rule.name && i !== _index)) {
                    const originalObj = rule.id ? await this.props.socket.getObject(rule.id) : { common: {}, native: {}, type: 'state' };
                    const obj = JSON.parse(JSON.stringify(originalObj));
                    Object.assign(obj.common, rule.common);
                    Object.assign(obj.native, rule.native);

                    // if name changed
                    if (rule.id !== `${this.namespace}${rule.name}`) {
                        rule.id && (await this.props.socket.delObject(rule.id));
                        await this.props.socket.setObject(`${this.namespace}${rule.name}`, obj);
                    } else {
                        if (JSON.stringify(originalObj.common) !== JSON.stringify(obj.common) ||
                            JSON.stringify(originalObj.native) !== JSON.stringify(obj.native)
                        ) {
                            await this.props.socket.setObject(rule.id, obj);
                        }
                    }
                }
            }
            this.setState({ changed: [] });
        }, 1000);
    }

    _onChange(index, isNative, attr, value) {
        const rules = JSON.parse(JSON.stringify(this.state.rules));
        const subName = isNative ? 'native' : 'common';
        if (attr === 'comma') {
            rules[index].common.type = 'number';
        }
        rules[index][subName][attr] = value;
        this.setState({ rules }, () => this.onAutoSave(index));
    }

    renderRule(rule, index, anyNumber, anySubstituteOld, anyNotArray) {
        const error = !rule.name || this.state.rules.find((r, i) => r.name === rule.name && i !== index)

        return <TableRow
            key={`${index}_${rule.id}`}
            style={this.state.changed.includes(index) ? styles.changedRow : undefined}
        >
            <TableCell style={styles.cell}>{index + 1}</TableCell>
            <TableCell style={styles.cell}>
                <Checkbox
                    disabled={error}
                    checked={rule.common.enabled}
                    onChange={e => this._onChange(index, false, 'enabled', e.target.checked)}
                />
            </TableCell>
            <TableCell style={styles.cell}>
                <TextField
                    fullWidth
                    value={rule.name}
                    error={!!error}
                    disabled={!rule.common.enabled}
                    onChange={e => {
                        const rules = JSON.parse(JSON.stringify(this.state.rules));
                        rules[index].name = e.target.value;
                        const error = this.checkError();
                        this.setState({ rules, error }, () => this.onAutoSave(index));
                    }}
                    variant="standard"
                />
            </TableCell>
            <TableCell style={styles.cell}>
                <TextField
                    fullWidth
                    disabled={error || !rule.common.enabled}
                    value={rule.native.link}
                    onChange={e => this._onChange(index, true, 'link', e.target.value)}
                    variant="standard"
                />
            </TableCell>
            <TableCell style={styles.cell}>
                <TextField
                    disabled={error || !rule.common.enabled}
                    fullWidth
                    value={rule.native.regex}
                    onChange={e => this._onChange(index, true, 'regex', e.target.value)}
                    variant="standard"
                />
            </TableCell>
            {anyNotArray ? <TableCell style={styles.cell}>
                {rule.common.type !== 'array' ? <TextField
                    fullWidth
                    disabled={error || !rule.common.enabled}
                    value={rule.native.item}
                    type="number"
                    onChange={e => this._onChange(index, true, 'item', e.target.value)}
                    variant="standard"
                /> : null}
            </TableCell> : null}
            <TableCell style={styles.cell}>
                <Select
                    fullWidth
                    disabled={error || !rule.common.enabled}
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
                    disabled={error || !rule.common.enabled}
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
            {anyNumber ? <TableCell style={styles.cell}>
                {rule.common.type === 'number' ?
                    <Checkbox
                        disabled={error || !rule.common.enabled}
                        checked={!!rule.native.comma}
                        onChange={e => this._onChange(index, true, 'comma', e.target.checked)}
                    /> : null}
            </TableCell> : null}
            {anyNumber ? <TableCell style={styles.cell}>
                <TextField
                    fullWidth
                    disabled={error || !rule.common.enabled}
                    value={rule.common.unit}
                    onChange={e => this._onChange(index, false, 'unit', e.target.value)}
                    variant="standard"
                />
            </TableCell> : null}
            <TableCell
                style={styles.cell}
                title={I18n.t('parser_If new value is not available, let old value unchanged')}
            >
                <Checkbox
                    disabled={error || !rule.common.enabled}
                    checked={rule.native.substituteOld}
                    onChange={e => this._onChange(index, true, 'substituteOld', e.target.checked)}
                />
            </TableCell
            >
            {anySubstituteOld ? <TableCell
                title={I18n.t('parser_If new value is not available, use this value')}
                style={styles.cell}
            >
                {!rule.native.substituteOld ?
                    <TextField
                        disabled={error || !rule.common.enabled}
                        fullWidth
                        value={rule.native.substituteOld ? '' : rule.native.substitute}
                        onChange={e => this._onChange(index, true, 'substitute', e.target.value)}
                        variant="standard"
                    /> : null}
            </TableCell> : null}
            {anyNumber ? <TableCell style={styles.cell}>
                {rule.common.type === 'number' ?
                    <TextField
                        disabled={error || !rule.common.enabled}
                        fullWidth
                        value={rule.native.factor}
                        onChange={e => this._onChange(index, true, 'factor', e.target.value)}
                        variant="standard"
                    /> : null}
            </TableCell> : null}
            {anyNumber ? <TableCell style={styles.cell}>
                {rule.common.type === 'number' ?
                    <TextField
                        disabled={error || !rule.common.enabled}
                        fullWidth
                        value={rule.native.offset}
                        onChange={e => this._onChange(index, true, 'offset', e.target.value)}
                        variant="standard"
                    /> : null}
            </TableCell> : null}
            <TableCell
                title={I18n.t('parser_Leave it empty if default interval is desired')}
                style={styles.cell}
            >
                <TextField
                    disabled={error || !rule.common.enabled}
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
                    disabled={error || !rule.common.enabled}
                    onClick={() =>
                        this.setState({
                            showEditDialog: JSON.parse(JSON.stringify(this.state.rules[index])), originalRule: JSON.stringify(this.state.rules[index]),
                        }, () => this.requestData(this.state.rules[index].native.link))}
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
                    disabled={error || !rule.common.enabled}
                    onClick={async () => {
                        const cloned = JSON.parse(JSON.stringify(this.state.rules[index]));
                        let i = 1;
                        let text = cloned.name;
                        const pattern = text.match(/(\d+)$/);
                        if (pattern) {
                            text = text.replace(pattern[0], '');
                            i = parseInt(pattern[0], 10) + 1;
                        } else {
                            text += '_';
                        }
                        while (this.state.rules.find(it => it[this.props.schema.clone] === text + i.toString())) {
                            i++;
                        }
                        cloned.name = text + i.toString();
                        cloned.id = `${this.namespace}${cloned.name}`;

                        await this.props.socket.setObject(`${this.namespace}${cloned.name}`, {
                            type: 'state',
                            common: rule.common,
                            native: rule.native,
                        });
                    }}
                >
                    <ContentCopy />
                </IconButton>
            </TableCell>
        </TableRow>;
    }

    renderDeleteDialog() {
        if (this.state.showDeleteDialog === null) {
            return null;
        }
        return <Confirm
            text={I18n.t('parser_Delete rule')}
            ok={I18n.t('ra_Delete')}
            onClose={async result => {

                if (result) {
                    const id = this.state.rules[this.state.showDeleteDialog].id;
                    const rules = JSON.parse(JSON.stringify(this.state.rules));
                    rules.splice(this.state.showDeleteDialog, 1);
                    this.setState({ rules, showDeleteDialog: null }, async () => {
                        id && (await this.props.socket.delObject(id));
                    });
                } else {
                    this.setState({ showDeleteDialog: null });
                }
            }}
        />
    }

    onTest(immediately) {
        this.timerTest && clearTimeout(this.timerTest);
        this.timerTest = setTimeout(() => {
            let test       = this.state.testText;
            let regex      = this.state.showEditDialog.native.regex;
            let type       = this.state.showEditDialog.common.type
            let comma      = this.state.showEditDialog.native.comma;
            let offset     = this.state.showEditDialog.native.offset;
            let item       = this.state.showEditDialog.native.item;
            let factor     = this.state.showEditDialog.native.factor;
            let parseHtml     = this.state.showEditDialog.native.parseHtml === 'true' || this.state.showEditDialog.native.parseHtml === true;
            let substitute = this.state.showEditDialog.native.substitute;

            if (!regex) {
                regex = '.+';
            }

            if (regex[0] === '/') {
                regex = regex.substring(1, regex.length - 1);
            }

            if (substitute !== '' && substitute !== undefined && substitute !== null) {
                if (substitute === 'null')  {
                    substitute = null;
                }

                if (type === 'number') {
                    substitute = parseFloat(substitute) || 0;
                } else if (type === 'boolean') {
                    if (substitute === 'true')  {
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
                regExpression = new RegExp(regex, item || type === 'array' ? 'g' : '');
            } catch (e) {
                this.setState({ testError: e.toString() });
                return;
            }
            offset = parseFloat(offset) || 0;
            factor = parseFloat(factor) || 1;
            item   = (parseInt(item, 10) || 0) + 1;
            if (item < 0) {
                item = 1;
            }
            if (item > 1000) {
                item = 1000;
            }
            test = (test || '').toString().replace(/\r\n|[\r\n]/g, ' ');
            let m;
            if (type === 'array') {
                m = test.match(regExpression);
            } else {
                do {
                    m = regExpression.exec(test);
                    item--;
                } while(item && m);
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
                        m = m.map(it => {
                            const _m = it.match(_regExpression);
                            if (_m && _m[1]) {
                                return _m[1];
                            } else {
                                return it;
                            }
                        });
                    }
                    if (parseHtml) {
                        newVal = JSON.stringify(m.map(it => it.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))));
                    } else {
                        newVal = JSON.stringify(m);
                    }
                }

                if (parseHtml && type === 'string') {
                    // replace &#48 with 0 and so on
                    newVal = newVal === null || newVal === undefined ? '' : newVal.toString();
                    newVal = newVal.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
                }

                this.setState({
                    testResult: newVal === null || newVal === undefined ? '' : newVal,
                    resultIndex: this.state.resultIndex + 1,
                }, () => {
                    // find position of the text
                    const ll = m[1] ? m[0].indexOf(m[1]) : 0;
                    // highlight text
                    const el = this.testTextRef.current;
                    const start = m.index + ll;
                    const end = m.index + ll + (m[1] ? m[1].length : m[0].length);
                    if (el?.setSelectionRange) {
                        el.focus();

                        const fullText = el.value;
                        el.value = fullText.substring(0, end);
                        const height = el.scrollHeight;
                        el.scrollTop = height;
                        el.value = fullText;
                        el.scrollTop = height - 30;

                        el?.setSelectionRange(start, end);
                    } else if (el?.createTextRange) {
                        const range = el.createTextRange();
                        range.collapse(true);
                        range.moveEnd('character', end);
                        range.moveStart('character', start);
                        range.select();
                    } else if (el?.selectionStart) {
                        el.selectionStart = start;
                        el.selectionEnd = end;
                    }
                });
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
        }, immediately ? 0 : 1000);
    }

    renderItem() {
        if (!this.state.rules) {
            return <LinearProgress />;
        }

        const anyNumber = this.state.rules.find(it => it.common.type === 'number');
        const anySubstituteOld = this.state.rules.find(it => !it.native.substituteOld);
        const anyNotArray = this.state.rules.find(it => it.common.type !== 'array');

        return <TableContainer component={Paper}>
            <style>
                {`
@keyframes admin-parser-blink {
    0% {
        color: #00FF00;
    }
    100% {
        color: ${this.props.themeType === 'dark' ? '#fff' : '#000'};
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
                        <TableCell style={{ ...styles.cell, ...styles.colActive }}>{I18n.t('parser_Active')}</TableCell>
                        <TableCell style={{ ...styles.cell, ...styles.colName }}>{I18n.t('parser_Name')}</TableCell>
                        <TableCell style={{ ...styles.cell, ...styles.colUrl }}>{I18n.t('parser_URL or file name')}</TableCell>
                        <TableCell style={{ ...styles.cell, ...styles.colRegEx }}>{I18n.t('parser_RegEx')}</TableCell>
                        {anyNotArray ? <TableCell style={{ ...styles.cell, ...styles.colItem }}>{I18n.t('parser_Item')}</TableCell> : null}
                        <TableCell style={{ ...styles.cell, ...styles.colRole }}>{I18n.t('parser_Role')}</TableCell>
                        <TableCell style={{ ...styles.cell, ...styles.colType }}>{I18n.t('parser_Type')}</TableCell>
                        {anyNumber ? <TableCell style={{ ...styles.cell, ...styles.colComma }}>{I18n.t('parser_Comma')}</TableCell> : null}
                        {anyNumber ? <TableCell style={{ ...styles.cell, ...styles.colUnit }}>{I18n.t('parser_Unit')}</TableCell> : null}
                        <TableCell style={{ ...styles.cell, ...styles.colSubstituteOld }} title={I18n.t('parser_If new value is not available, let old value unchanged')}>{I18n.t('parser_Old')}</TableCell>
                        {anySubstituteOld ? <TableCell style={{ ...styles.cell, ...styles.colSubstitute }} title={I18n.t('parser_If new value is not available, use this value')}>{I18n.t('parser_Subs')}</TableCell> : null}
                        {anyNumber ? <TableCell style={{ ...styles.cell, ...styles.colFactor }}>{I18n.t('parser_Factor')}</TableCell> : null}
                        {anyNumber ? <TableCell style={{ ...styles.cell, ...styles.colOffset }}>{I18n.t('parser_Offset')}</TableCell> : null}
                        <TableCell style={{ ...styles.cell, ...styles.colInterval }} title={I18n.t('parser_Leave it empty if default interval is desired')}>{I18n.t('parser_Interval')}</TableCell>
                        <TableCell style={{ ...styles.cell, ...styles.colButtons }}>
                            <Fab
                                size="small"
                                color="primary"
                                onClick={() => {
                                    const rules = JSON.parse(JSON.stringify(this.state.rules));
                                    rules.push({
                                        id: '',
                                        name: '',
                                        common: {
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
                    {this.state.rules.map((rule, index) => this.renderRule(rule, index, anyNumber, anySubstituteOld, anyNotArray))}
                </TableBody>
            </Table>
        </TableContainer>;
    }
}

ParserComponent.propTypes = {
    socket: PropTypes.object.isRequired,
    themeType: PropTypes.string,
    themeName: PropTypes.string,
    style: PropTypes.object,
    className: PropTypes.string,
    data: PropTypes.object.isRequired,
    attr: PropTypes.string,
    schema: PropTypes.object,
    onError: PropTypes.func,
    onChange: PropTypes.func,
};

export default ParserComponent;
