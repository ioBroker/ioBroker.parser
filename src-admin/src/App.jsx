// this file used only for simulation and not used in end build
import React from 'react';
import { ThemeProvider, StyledEngineProvider } from '@mui/material/styles';

import { Box } from '@mui/material';

import { I18n, Loader, GenericApp } from '@iobroker/adapter-react-v5';

import AcmeComponent from './ParserComponent';

const styles = {
    app: theme => ({
        backgroundColor: theme.palette.background.default,
        color: theme.palette.text.primary,
        height: '100%',
        width: '100%',
    }),
    item: {
        padding: 50,
        width: 'calc(100% - 100px)',
    }
};

class App extends GenericApp {
    constructor(props) {
        const extendedProps = { ...props };
        super(props, extendedProps);

        this.state = {
            data: { myCustomAttribute: 'red' },
            theme: this.createTheme(),
        };
        const translations = {
            en: require('./i18n/en'),
            de: require('./i18n/de'),
            ru: require('./i18n/ru'),
            pt: require('./i18n/pt'),
            nl: require('./i18n/nl'),
            fr: require('./i18n/fr'),
            it: require('./i18n/it'),
            es: require('./i18n/es'),
            pl: require('./i18n/pl'),
            uk: require('./i18n/uk'),
            'zh-cn': require('./i18n/zh-cn'),
        };

        I18n.setTranslations(translations);
        I18n.setLanguage((navigator.language || navigator.userLanguage || 'en').substring(0, 2).toLowerCase());
    }

    render() {
        if (!this.state.loaded) {
            return <StyledEngineProvider injectFirst>
                <ThemeProvider theme={this.state.theme}>
                    <Loader themeType={this.state.themeType} />
                </ThemeProvider>
            </StyledEngineProvider>;
        }

        return <StyledEngineProvider injectFirst>
            <ThemeProvider theme={this.state.theme}>
                <Box sx={styles.app}>
                    <div style={styles.item}>
                        <AcmeComponent
                            socket={this.socket}
                            adapterName="parser"
                            themeType={this.state.themeType}
                            themeName={this.state.themeName}
                            attr='myCustomAttribute'
                            data={this.state.data}
                            onError={() => {}}
                            instance={0}
                            schema={{
                                name: 'ConfigCustomAcmeSet/Components/AcmeComponent',
                                type: 'custom',
                            }}
                            onChange={data => {
                                this.setState({ data });
                            }}
                        />
                    </div>
                </Box>
            </ThemeProvider>
        </StyledEngineProvider>;
    }
}

export default App;
