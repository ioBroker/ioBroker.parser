import React from 'react';

import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    Checkbox,
    Select,
    MenuItem,
    Grid2 as Grid,
    FormControlLabel,
    FormControl,
    InputLabel,
    Fab,
} from '@mui/material';

import { Save, Close, PlayArrow } from '@mui/icons-material';

import { I18n, type IobTheme } from '@iobroker/adapter-react-v5';

import type { ParserRule } from './types';

const styles: Record<string, any> = {
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
    item: {
        width: 50,
        marginLeft: 10,
    },
    regex: {
        width: 'calc(100% - 100px)',
    },
    marginRight: {
        marginRight: 10,
    },
};

interface EditDialogProps {
    rule: ParserRule;
    logSources: string[];
    theme: IobTheme;
    onClose: () => void;
    onSave: (rule: ParserRule) => void;
    fetchText: () => Promise<string | null>;
}

interface EditDialogState {
    rule: ParserRule;
    testText: string;
    testResult: string | number | boolean;
    testError: string;
    resultIndex: number;
}

export class EditDialog extends React.Component<EditDialogProps, EditDialogState> {
    private readonly testTextRef: React.RefObject<HTMLTextAreaElement>;
    private timerTest: ReturnType<typeof setTimeout> | null = null;
    private readonly originalRule: string;

    constructor(props: EditDialogProps) {
        super(props);
        this.originalRule = JSON.stringify(props.rule);
        this.state = {
            rule: JSON.parse(this.originalRule),
            testText: 'Test text',
            testResult: '',
            testError: '',
            resultIndex: 0,
        };
        this.testTextRef = React.createRef();
    }

    async componentDidMount(): Promise<void> {
        const text = await this.props.fetchText();
        if (text !== null) {
            this.setState({ testText: text }, () => this.onTest());
        }
    }

    componentWillUnmount(): void {
        if (this.timerTest) {
            clearTimeout(this.timerTest);
            this.timerTest = null;
        }
    }

    onTest(immediately?: boolean): void {
        if (this.timerTest) {
            clearTimeout(this.timerTest);
            this.timerTest = null;
        }
        this.timerTest = setTimeout(
            () => {
                const { rule } = this.state;
                let test = this.state.testText;
                let regex = rule.native.regex;
                const type = rule.common.type;
                const comma = rule.native.comma;
                const offsetStr = rule.native.offset;
                const itemStr = rule.native.item;
                const factorStr = rule.native.factor;
                const parseHtml = rule.native.parseHtml === 'true' || rule.native.parseHtml === true;
                let substitute = rule.native.substitute;

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
                    regExpression = new RegExp(regex, itemStr || type === 'array' ? 'gd' : 'd');
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
                    let newVal: any;

                    if (type === 'boolean') {
                        newVal = 'true';
                    } else if (type !== 'array') {
                        newVal = m.length > 1 ? m[1] : m[0];
                        if (type === 'number') {
                            if (!comma) {
                                newVal = newVal.replace(/,/g, '');
                            } else {
                                newVal = newVal.replace(/\./g, '');
                                newVal = newVal.replace(',', '.');
                            }
                            newVal = newVal.replace(/\s/g, '');
                            newVal = parseFloat(newVal);
                            newVal *= factor;
                            newVal += offset;
                        }
                    } else {
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
                                m?.map(it =>
                                    it.replace(/&#(\d+);/g, (_match: string, dec: string) =>
                                        String.fromCharCode(Number(dec)),
                                    ),
                                ),
                            );
                        } else {
                            newVal = JSON.stringify(m);
                        }
                    }

                    if (parseHtml && type === 'string') {
                        newVal = newVal === null || newVal === undefined ? '' : newVal.toString();
                        newVal = newVal.replace(/&#(\d+);/g, (_match: string, dec: string) =>
                            String.fromCharCode(Number(dec)),
                        );
                    }

                    this.setState(
                        {
                            testResult: newVal === null || newVal === undefined ? '' : newVal,
                            resultIndex: this.state.resultIndex + 1,
                        },
                        () => {
                            if (m) {
                                let start: number;
                                let end: number;
                                if (m.indices) {
                                    [start, end] = m.indices[1] || m.indices[0];
                                } else {
                                    const ll = m[1] ? m[0].indexOf(m[1]) : 0;
                                    start = (m.index || 0) + ll;
                                    end = (m.index || 0) + ll + (m[1] ? m[1].length : m[0].length);
                                }
                                const el = this.testTextRef.current;
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
                        this.setState({ testResult: 'false', resultIndex: this.state.resultIndex + 1 });
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

    render(): React.JSX.Element {
        const { rule } = this.state;
        const { theme } = this.props;

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
                    <span style={{ fontStyle: 'italic', fontWeight: 'bold', marginLeft: 10 }}>{rule.common.name}</span>
                </DialogTitle>
                <DialogContent>
                    <Grid
                        container
                        spacing={2}
                    >
                        <Grid size={12}>
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
                                        this.setState({ rule: newRule }, () => this.onTest());
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
                                            checked={!!rule.native.comma}
                                            onChange={() => {
                                                const newRule: ParserRule = JSON.parse(JSON.stringify(rule));
                                                newRule.native.comma = !newRule.native.comma;
                                                this.setState({ rule: newRule }, () => this.onTest());
                                            }}
                                        />
                                    }
                                    label={I18n.t('parser_Comma')}
                                />
                            ) : null}
                        </Grid>
                        {rule.native.type === 'ioblog' ? (
                            <Grid size={12}>
                                <FormControl
                                    variant="standard"
                                    style={styles.marginRight}
                                >
                                    <InputLabel>{I18n.t('parser_Log level')}</InputLabel>
                                    <Select
                                        value={rule.native.logLevel || '*'}
                                        onChange={e => {
                                            const newRule: ParserRule = JSON.parse(JSON.stringify(rule));
                                            newRule.native.logLevel = e.target.value as ioBroker.LogLevel | '*';
                                            this.setState({ rule: newRule });
                                        }}
                                        variant="standard"
                                    >
                                        <MenuItem value="*">{I18n.t('parser_Any')}</MenuItem>
                                        <MenuItem value="silly">silly</MenuItem>
                                        <MenuItem value="debug">debug</MenuItem>
                                        <MenuItem value="info">info</MenuItem>
                                        <MenuItem value="warn">warn</MenuItem>
                                        <MenuItem value="error">error</MenuItem>
                                    </Select>
                                </FormControl>
                                <FormControl
                                    variant="standard"
                                    style={styles.marginRight}
                                >
                                    <InputLabel>{I18n.t('parser_Log source')}</InputLabel>
                                    <Select
                                        value={rule.native.logSource || '*'}
                                        onChange={e => {
                                            const newRule: ParserRule = JSON.parse(JSON.stringify(rule));
                                            newRule.native.logSource =
                                                e.target.value === '*' ? undefined : e.target.value;
                                            this.setState({ rule: newRule });
                                        }}
                                        variant="standard"
                                        style={{ minWidth: 150 }}
                                    >
                                        <MenuItem value="*">{I18n.t('parser_Any')}</MenuItem>
                                        {this.props.logSources.map(src => (
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
                                </FormControl>
                            </Grid>
                        ) : null}
                        <Grid size={12}>
                            <FormControlLabel
                                title={I18n.t('parser_If new value is not available, let old value unchanged')}
                                style={styles.marginRight}
                                control={
                                    <Checkbox
                                        checked={!!rule.native.substituteOld}
                                        onChange={() => {
                                            const newRule: ParserRule = JSON.parse(JSON.stringify(rule));
                                            newRule.native.substituteOld = !newRule.native.substituteOld;
                                            this.setState({ rule: newRule }, () => this.onTest());
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
                                        this.setState({ rule: newRule }, () => this.onTest());
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
                                        this.setState({ rule: newRule }, () => this.onTest());
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
                                        this.setState({ rule: newRule }, () => this.onTest());
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
                                                this.setState({ rule: newRule }, () => this.onTest());
                                            }}
                                        />
                                    }
                                    label={I18n.t('parser_Parse HTML text')}
                                />
                            ) : null}
                        </Grid>
                        <Grid size={12}>
                            <TextField
                                value={rule.native.regex || ''}
                                onChange={e => {
                                    const newRule: ParserRule = JSON.parse(JSON.stringify(rule));
                                    newRule.native.regex = e.target.value;
                                    this.setState({ rule: newRule }, () => this.onTest());
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
                                        this.setState({ rule: newRule }, () => this.onTest());
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
                            size={12}
                            sx={styles.testText(theme)}
                        >
                            <textarea
                                ref={this.testTextRef}
                                value={this.state.testText}
                                onChange={e => this.setState({ testText: e.target.value }, () => this.onTest())}
                            />
                        </Grid>
                        <Grid size={12}>
                            <TextField
                                sx={styles.resultUpdated(theme)}
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
                        disabled={JSON.stringify(this.state.rule) === this.originalRule}
                        onClick={() => this.props.onSave(this.state.rule)}
                        color="primary"
                        startIcon={<Save />}
                        variant="contained"
                    >
                        {I18n.t('ra_Save')}
                    </Button>
                    <Button
                        color="grey"
                        onClick={this.props.onClose}
                        variant="contained"
                        startIcon={<Close />}
                    >
                        {I18n.t('ra_Cancel')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }
}
