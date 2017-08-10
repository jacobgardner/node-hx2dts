
/**
 * DTSDumper.js
 * created by Jeremy Faivre on 09/02/15.
 */

var _ = require('lodash');

var DTSDumper = function(input) {

    this.output = null;
    this.input = input;
    this.indent = 0;
    this.typesUsed = {
        'Array': 0,
        'Array<number>': 0,
    };
};


DTSDumper.prototype.getOutput = function() {
    if (this.output == null) {
        this.output = '';
        this.dumpFromInput();
    }

    return this.output;
};

const path = require('path');

DTSDumper.prototype.dumpFromInput = function() {
    this.computeTypeReplacements();

    console.log(this.input);

    const currentPath = this.input.package.replace(/\./g, '/');

    const processDependency = (dependency) => {
        dependency = dependency.replace(/<.*>/, '');
        var lastDot = dependency.lastIndexOf('.');


        if (lastDot === 1) {
            console.log('DEPENDENCY: ', dependency);
            return;
        }

        const name = dependency.substring(lastDot+1);

        if (this.typesUsed[name] === 0) {
            return;
        }

        const newPath = dependency.replace(/\./g, '/');    

        const importPath = newPath.search('/') === -1 ? './' + newPath : path.relative(currentPath, newPath);
        // console.log(currentPath, newPath);

        this.output = `import { ${name} } from '${importPath}';\n` + this.output;
        this.typesUsed[name] = 0;
    }    

    this.input.dependencies.forEach(processDependency);

    if (this.input.package != null) {
        // this.writeIndentedLine('declare module ' + this.input.package + ' {');
        this.writeLineBreak();
        this.indent++;
    }

    var _this = this;

    // Dump element with module name
    this.input.entries.forEach(function(entry) {
        if (_this.isEntryWithModuleName(entry)) {
            _this.dumpEntry(entry);
        }
    });

    // Check if there are other elements to dump
    var hasMoreElements = false;
    this.input.entries.forEach(function(entry) {
        if (!_this.isEntryWithModuleName(entry)) {
            hasMoreElements = true;
        }
    });

    if (hasMoreElements) {
        // Dump other elements
        //
        // this.writeIndentedLine('module ' + this.input.moduleName + ' {');
        this.writeLineBreak();
        this.indent++;

        this.input.entries.forEach(function(entry) {
            if (!_this.isEntryWithModuleName(entry)) {
                _this.dumpEntry(entry);
            }
        });

        this.indent--;
        // this.writeIndentedLine('}');
        this.writeLineBreak();
    }

    if (this.input.package != null) {
        this.indent--;
        // this.writeIndentedLine('}');
        this.writeLineBreak();
    }

    for (let key in this.typesUsed) {
        if (this.typesUsed[key]) {
            processDependency(key);
            // key = key.replace(/<.*>/, '');
            // this.output = `import { ${key} } from './${key}';\n` + this.output;
        }
    }
};


DTSDumper.prototype.computeTypeReplacements = function() {
    this.typeReplacements = {};

    // Default replacements
    this.typeReplacements['String'] = 'string';
    this.typeReplacements['Int'] = 'number';
    this.typeReplacements['UInt'] = 'number';
    this.typeReplacements['Float'] = 'number';
    this.typeReplacements['Bool'] = 'boolean';
    this.typeReplacements['Array<Dynamic>'] = 'Array<any>';
    this.typeReplacements['Dynamic'] = 'any';
    this.typeReplacements['Void'] = 'void';

    // Imported replacements
    var _this = this;
    this.input.dependencies.forEach(function(dependency) {
        // var lastDot = dependency.lastIndexOf('.');
        // if (lastDot != -1) {
        //     _this.typeReplacements[dependency.substring(lastDot+1)] = dependency;
        // }
    });
};


DTSDumper.prototype.isEntryWithModuleName = function(entry) {
    var moduleName = this.input.moduleName;
    if (entry.className != null && moduleName == entry.className.split('<')[0]) return true;
    if (entry.interfaceName != null && moduleName == entry.interfaceName.split('<')[0]) return true;
    if (entry.typedefName != null && moduleName == entry.typedefName.split('<')[0]) return true;
    if (entry.enumName != null && moduleName == entry.enumName.split('<')[0]) return true;
    return false;
};


DTSDumper.prototype.dumpEntry = function(entry) {
    if (!entry.isPrivate || !(entry.methodName || entry.propertyName)) {
        var _this = this;

        if (entry.comments != null) {
            this.writeIndentedLine('/**');
            entry.comments.split("\n").forEach(function(comment) {
                _this.writeIndentedLine(' * ' + comment);
            });
            this.writeIndentedLine(' */');
        }

        if (entry.propertyName != null) {
            console.log(this.getComposedIdentifierName(entry.propertyName), this.getType(entry.propertyType));
            this.writeIndentedLine((entry.isStatic ? 'static ' : '') + this.getComposedIdentifierName(entry.propertyName) + ': ' + this.getType(entry.propertyType) + ';');
            this.writeLineBreak();
        }
        else if (entry.methodName != null) {
            console.log('METHOD NAME:', entry.methodName);
            console.log(entry);
            if (entry.methodName == 'new') {
                this.writeIndentedLine((entry.isStatic ? 'static ' : '') + 'constructor(' + this.getArguments(entry.arguments) + ');');
            } else {
                this.writeIndentedLine((entry.isStatic ? 'static ' : '') + this.getComposedIdentifierName(entry.methodName) + '(' + this.getArguments(entry.arguments) + '): ' + this.getType(entry.returnType) + ';');
            }
            this.writeLineBreak();
        }
        else if (entry.className != null) {
            const className = this.getComposedIdentifierName(entry.className);
            this.writeIndentedLine('export class ' + className + this.getHeritageClauses(entry) + ' {');
            this.typesUsed[className] = 0;
            this.writeLineBreak();
            this.indent++;

            entry.entries.forEach(function (entry) {
                _this.dumpEntry(entry);
            });

            this.indent--;
            this.writeIndentedLine('}');
            this.writeLineBreak();
        }
        else if (entry.interfaceName != null) {
            const interfaceName = this.getComposedIdentifierName(entry.interfaceName);
            this.writeIndentedLine('export interface ' + interfaceName + this.getHeritageClauses(entry) + ' {');
            this.writeLineBreak();
            this.indent++;

            this.typesUsed[interfaceName] = 0;

            entry.entries.forEach(function (entry) {
                _this.dumpEntry(entry);
            });

            this.indent--;
            this.writeIndentedLine('}');
            this.writeLineBreak();
        }
        else if (entry.typedefName != null) {
            if (entry.typedefType != null) {
                this.writeIndentedLine('export interface ' + this.getComposedIdentifierName(entry.typedefName) + ' extends ' + this.getComposedIdentifierName(entry.typedefType) + ' {}');
                this.writeLineBreak();
            } else {
                this.writeIndentedLine('export interface ' + this.getComposedIdentifierName(entry.typedefName) + ' {');
                this.writeLineBreak();
                this.indent++;

                entry.entries.forEach(function (entry) {
                    _this.dumpEntry(entry);
                });

                this.indent--;
                this.writeIndentedLine('}');
                this.writeLineBreak();
            }
        }
        else if (entry.enumName != null) {
            console.log('ENTRY: ', entry.enumName);
            this.writeIndentedLine('export enum ' + this.getComposedIdentifierName(entry.enumName) + ' {');
            this.writeLineBreak();
            this.indent++;

            var lastI = 0;
            var hasEntriesWithArguments = false;

            entry.enumValues.forEach(function(value, i) {
                if (value.valueArguments == null) {
                    lastI = i;
                } else {
                    hasEntriesWithArguments = true;
                }
            });

            // console.log(entry.enumValues);
            entry.enumValues.forEach(function(value, i) {
                if (value.valueArguments == null) {
                    _this.writeIndentedLine(value.valueName+(i < lastI ? ',' : ''));
                    _this.writeLineBreak();
                }
            });

            this.indent--;
            this.writeIndentedLine('}');
            this.writeLineBreak();

            if (hasEntriesWithArguments) {
                // this.writeIndentedLine('declare module ' + this.getComposedIdentifierName(entry.enumName) + ' {');
                this.writeLineBreak();
                this.indent++;

                entry.enumValues.forEach(function(value, i) {
                    if (value.valueArguments != null) {
                        _this.writeIndentedLine('static ' + _this.getComposedIdentifierName(value.valueName) + '(' + _this.getArguments(value.valueArguments) + '): ' + _this.getComposedIdentifierName(entry.enumName) + ';');
                    }
                });

                this.indent--;
                // this.writeIndentedLine('}');
                this.writeLineBreak();
            }
        }
    }
};


DTSDumper.prototype.getComposedIdentifierName = function(input) {
    const paren = input.indexOf('(');
    if (paren !== -1) {
        input = input.substring(0, paren);
    }

    if (input.indexOf('<') !== -1) {
        var _this = this;
        input = input.replace(/<(.*)>/, function(match, contents, offset, s) {
            return '<' + _this.getType(contents) + '>';
        });
    }
    return input;
};


DTSDumper.prototype.getHeritageClauses = function(entry) {
    var clauses = [];
    var _this = this;

    if (entry.extendsClass != null) {
        clauses.push('extends ' + this.getType(entry.extendsClass));
    }

    if (entry.extendsInterfaces != null) {
        var extendedInterfaces = [];
        entry.extendsInterfaces.forEach(function(name) {
            extendedInterfaces.push(_this.getType(name));
        });
        if (extendedInterfaces.length > 0) {
            clauses.push('extends ' + extendedInterfaces.join(', '));
        }
    }

    if (entry.implementsInterfaces != null) {
        var implementedInterfaces = [];
        entry.implementsInterfaces.forEach(function(name) {
            implementedInterfaces.push(_this.getType(name));
        });
        if (implementedInterfaces.length > 0) {
            clauses.push('implements ' + implementedInterfaces.join(', '));
        }
    }

    if (clauses.length > 0) {
        return ' '+clauses.join(' ');
    } else {
        return '';
    }
};


DTSDumper.prototype.getType = function(rawType) {

    if (rawType == null) return 'any';

    if (rawType.indexOf(':') != -1) {
        rawType = rawType.substring(0, rawType.indexOf(':'));
    }

    if (rawType.substring(0,5) == 'Null<' && rawType.charAt(rawType.length - 1) == '>') {
        rawType = rawType.substring(5, rawType.length - 1);
    }

    if (this.typeReplacements[rawType] != null) {
        return this.typeReplacements[rawType];
    }

    // Composed types
    firstGt = rawType.indexOf('>');
    var result = null;
    if (firstGt != -1) {
        result = '';
        var i = 0;
        var len = rawType.length;
        var currentWord = '';
        var ch = null;
        while (i < len) {
            ch = rawType.charAt(i);
            if (ch == '<' || ch == '>' || ch == ',' || ch == '-') {
                if (currentWord.length > 0) {
                    result += this.getType(currentWord);
                    currentWord = '';
                }
                result += ch;
            }
            else {
                currentWord += ch;
            }

            i++;
        }

        if (currentWord.length > 0) {
            result += this.getType(currentWord);
        }
    }

    if (result == null) {
        result = rawType;
    }

    // Function type
    if (result.indexOf('->') != -1) {
        result = this.convertCallbacks(result);
    }

    if (this.typesUsed[result] === undefined) {
        this.typesUsed[result] = 1;
    }

    // // console.log(result);
    // const lastDot = result.lastIndexOf('.');
    // console.log(result);

    // return result.substring(lastDot);

    return result;
};


DTSDumper.prototype.convertCallbacks = function(input) {
    return input.replace(/([^\-]+\->[^\-]+(\->[^\-]+)*)/, function(match, contents, offset, s) {
        var elements = contents.split('->');
        if (elements.length == 2) {
            if (elements[0] == 'void') {
                return '()=>' + elements[1];
            }
            else {
                return '(' + elements[0] + ')=>' + elements[1]
            }
        } else {
            var args = [];
            for (var i = 0, len = elements.length; i < len - 1; i++) {
                args.push('arg' + (i + 1) + ':' + elements[i]);
            }
            return '(' + args.join(', ') + ')=>' + elements[elements.length - 1];
        }
        return contents;
    });
};


DTSDumper.prototype.getArguments = function(rawArguments) {
    var result = [];
    var _this = this;

    rawArguments.forEach(function(arg) {
        result.push(_this.getTypescriptLikeName(arg.argumentName) + (arg.isOptional || arg.defaultValue ? '?' : '') + ':' + _this.getType(arg.argumentType));
    });

    return result.join(', ');
};


DTSDumper.prototype.getTypescriptLikeName = function(input) {
    if (input.charAt(0) != input.charAt(0).toLowerCase()) {
        var isAllCapital = true;
        var len = input.length;
        for (var i = 0; i < len; i++) {
            if (input.charAt(i) != input.charAt(i).toLowerCase()) {
                isAllCapital = false;
                break;
            }
        }
        if (!isAllCapital && (len <= 1 || input.charAt(1) == input.charAt(1).toLowerCase())) {
            return input.charAt(0).toLowerCase() + input.substring(1);
        }
    }
    return input;
};


DTSDumper.prototype.writeIndentSpaces = function(steps) {
    this.write(this.indentSpaces(steps));
};


DTSDumper.prototype.writeLineBreak = function() {
    this.write("\n");
};


DTSDumper.prototype.writeIndentedLine = function(str) {
    this.writeIndentSpaces();
    this.write(str);
    this.writeLineBreak();
};


DTSDumper.prototype.write = function(str) {
    this.output += str;
};


DTSDumper.prototype.indentSpaces = function(steps) {
    if (steps == null) {
        steps = this.indent;
    }
    var spaces = '';
    for (var i = 0; i < steps; i++) {
        spaces += '    ';
    }
    return spaces;
};

module.exports = DTSDumper;
