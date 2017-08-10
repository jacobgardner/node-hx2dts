/**
 * HXParser.js
 * created by Jeremy Faivre on 06/02/15.
 */

var _ = require("lodash");

var REGEX_QUOTED_STRING = new RegExp(
    "^(?:\"(?:[^\"\\\\]*(?:\\\\.[^\"\\\\]*)*)\"|'(?:[^']*(?:''[^']*)*)')",
    ""
);

/**
 * Utility class to generate JSON object from haxe source code.
 * The JSON will contain dependencies, classes, interfaces, enums, typedefs, properties and methods informations.
 */
var HXParser = function(input, moduleName) {
    this.input = input;

    // console.log('MODULE:', moduleName);

    this.classesByName = {};
    this.interfacesByName = {};
    this.enumsByName = {};
    this.typedefsByName = {};

    this.currentClass = null;
    this.currentClassBraces = 0;
    this.currentInterface = null;
    this.currentInterfaceBraces = 0;
    this.currentEnum = null;
    this.currentEnumBraces = 0;
    this.currentTypedef = null;
    this.currentTypedefBraces = 0;

    this.info = {
        moduleName: moduleName,
        dependencies: [],
        entries: []
    };
    this.braces = 0;
};

HXParser.prototype.getInfo = function() {
    if (!this.didCleanupAndParseHaxe) {
        this.cleanupHaxe();
        this.parseHaxe();

        this.didCleanupAndParseHaxe = true;
    }

    return _.cloneDeep(this.info);
};

HXParser.prototype.cleanupHaxe = function() {
    var i = 0;
    var input = this.input;
    var newInput = "";
    var currentRawComment = null;
    var rawComments = [];
    var numberOfOpenLts = 0;

    if (this.info.moduleName === 'Graphics') {
        console.log(input);
    }

    while (i < input.length) {
        var hx = input.substring(i);

        if (this.isInSingleLineComment) {
            if (hx.charAt(0) == "\n") {
                this.isInSingleLineComment = false;
                rawComments.push({
                    text: currentRawComment,
                    multiline: false,
                    line: newInput.split("\n").length
                });
                currentRawComment = null;
            } else {
                currentRawComment += hx.charAt(0);
            }
            newInput += " ";
            i++;
        } else if (this.isInMultiLineComment) {
            if (hx.substr(0, 2) == "*/") {
                this.isInMultiLineComment = false;
                rawComments.push({
                    text: currentRawComment,
                    multiline: true,
                    line: newInput.split("\n").length
                });
                currentRawComment = null;
                newInput += "  ";
                i += 2;
            } else {
                currentRawComment += hx.charAt(0);
                if (hx.charAt(0) == "\n") {
                    newInput += "\n";
                } else {
                    newInput += " ";
                }
                i++;
            }
        } else if (hx.substr(0, 2) == "->") {
            newInput += "->";
            i += 2;
        } else if (hx.charAt(0) == "<") {
            numberOfOpenLts++;
            newInput += "<";
            i++;
        } else if (hx.charAt(0) == ">") {
            numberOfOpenLts = Math.max(0, numberOfOpenLts - 1);
            newInput += ">";
            i++;
        } else if (hx.substr(0, 2) == "//") {
            this.isInSingleLineComment = true;
            currentRawComment = "";
            newInput += "  ";
            i += 2;
        } else if (hx.substr(0, 2) == "/*") {
            this.isInMultiLineComment = true;
            currentRawComment = "";
            newInput += "  ";
            i += 2;
        } else if (hx.charAt(0).trim() == "") {
            // if (numberOfOpenLts <= 0) {
                newInput += hx.charAt(0);
            // }
            i++;
        } else if (
            (hx.charAt(0) == "'" || hx.charAt(0) == '"') &&
            ((REGEX_QUOTED_STRING.lastIndex = -1) &&
                (matches = hx.match(REGEX_QUOTED_STRING)))
        ) {
            newInput += matches[0];
            i += matches[0].length;
        } else {
            newInput += hx.charAt(0);
            i++;
        }
    }

    this.input = newInput;
    this.isInMultiLineComment = false;
    this.isInSingleLineComment = false;

    var _this = this;
    rawComments.forEach(function(rawComment, i) {
        rawComments[i].text = _this.parseRawComment(rawComment.text);
    });
    this.comments = rawComments;
};

HXParser.prototype.parseRawComment = function(rawComment) {
    var lines = rawComment.split("\t").join("    ").split("\r").join("");
    lines = lines.substring(1, lines.length - 1).split("\n");
    var lowestIndent = 99999;
    for (var i = 0, len = lines.length; i < len; i++) {
        var line = lines[i];
        var cleanedLine = line.replace(/^([\s\*]+)/, "");
        if (cleanedLine.trim() != "") {
            var lenBefore = line.length;
            var lenAfter = cleanedLine.length;
            if (lenBefore - lenAfter < lowestIndent) {
                lowestIndent = lenBefore - lenAfter;
            }
        }
    }

    var result = [];
    for (i = 0, len = lines.length; i < len; i++) {
        var line = lines[i];
        line = line.substring(lowestIndent);
        if (result.length != 0 || line.trim() != "") {
            result.push(line);
        }
    }
    result = result.join("\n");
    result = result.replace(/\s+$/, "");

    return result;
};

function replaceDefs(input, defs) {
    let output = "";
    let offset = 0;

    while (true) {
        let m = input.substring(offset).match(/#if (\(.*?\)|\S+)/);

        if (!m) {
            output += input.substring(offset);
            break;
        }

        output += input.substring(offset, offset + m.index);
        offset += m.index + m[0].length;

        let condition = m[1];

        if (condition[0] === "(") {
            condition = condition.substring(1, condition.length - 1);
        }

        const conditions = condition.split(/(\|\||&&)/).map(s => s.trim());
        let useCode;

        for (let i = 0; i < conditions.length; i += 2) {
            let flag;

            const c = conditions[i];

            if (c[0] === "!") {
                flag = defs.indexOf(c.substring(1)) === -1;
            } else {
                flag = defs.indexOf(c) !== -1;
            }

            if (i === 0) {
                useCode = flag;
            } else {
                if (conditions[i - 1] === "&&") {
                    useCode = useCode && flag;
                } else if (conditions[i - 1] === "||") {
                    useCode = useCode || flag;
                }
            }
        }

        m = input.substring(offset).match(/#end/);

        if (useCode) {
            output += input.substring(offset, offset + m.index);
        }

        offset += m.index + m[0].length;
    }

    output += input.substring(offset);

    return output;
}

HXParser.prototype.parseHaxe = function() {
    var i = 0;
    var input = this.input;
    var matches = null;

    if (this.info.moduleName === 'Graphics') {
        console.log('THIS INPUT:', input);
    }

    input = replaceDefs(input, ["js", "html5"]);

    while (i < input.length) {
        var hx = input.substring(i);
        matches = null;

        if (this.info.moduleName === "DisplayObject") {
            const mm = hx.match(
                /^((?:(private|static|public|override|inline|virtual|(?:@:[^\s]+))\s+)*)?function/ //\s+([a-zA-Z_][a-zA-Z0-9_<,>:\-]*)\s*\(([^\)]*)\)(\s*:\s*((?:[a-zA-Z_][a-zA-Z0-9_]*\.)*[a-zA-Z_][a-zA-Z0-9_<,>\-]*))?(\s*\{|\s*;)/
            );

            if (mm) {
                console.log("MM:", mm[0], hx.substring(0, 50));
                console.log(
                    this.currentMethod,
                    this.currentClass,
                    this.currentInterface,
                    this.currentTypedef
                );
            }
        }

        // Package
        if (
            this.info.package == null &&
            (matches = hx.match(
                /^\s*package(\s+((?:[a-zA-Z_][a-zA-Z_0-9]*)(?:\.[a-zA-Z_][a-zA-Z_0-9]*)*)?)?;/
            ))
        ) {
            var matchedHx = matches[0];
            var packageName = matches[2];

            if (packageName != null && packageName.length > 0) {
                this.info.package = packageName;
            }

            i += matchedHx.length;
        } else if (
            (matches = hx.match(
                /^import(\s+((?:[a-zA-Z_][a-zA-Z_0-9]*)(?:\.[a-zA-Z_][a-zA-Z_0-9]*)*)?)?;/
            ))
        ) {
            var matchedHx = matches[0];
            var packageName = matches[2];

            if (packageName != null && packageName.length > 0) {
                if (this.info.dependencies.indexOf(packageName) == -1) {
                    this.info.dependencies.push(packageName);
                }
            }

            i += matchedHx.length;
        } else if (
            this.currentMethod == null &&
            (matches = hx.match(
                /^(private\s+)?(?:interface|abstract)\s+([a-zA-Z_][a-zA-Z_0-9_<,>\(\):\-]*)((\s+extends\s+(([a-zA-Z_][a-zA-Z_0-9_<,>\(\):\-]*\.)*[a-zA-Z_][a-zA-Z_0-9_<,>\(\):\-]*))*).*(\s*\{|\s*;)/
                // /^(private\s+)?(?:interface|abstract)\s+([a-zA-Z_][a-zA-Z_0-9_<,>\(\):\-]*)((\s+extends\s+(([a-zA-Z_][a-zA-Z_0-9_<,>\(\):\-]*\.)*[a-zA-Z_][a-zA-Z_0-9_<,>\(\):\-]*))*)(\s*\{|\s*;)/
            ))
        ) {
            // Interface
            var matchedHx = matches[0];
            console.log("Interface", matches[0]);

            // Basic info
            var interfaceInfo = {
                interfaceName: matches[2],
                entries: []
            };

            // Comments?
            var comments = this.getCommentsBeforeLine(
                input.substring(0, i).split("\n").length
            );
            if (comments.trim().length > 0) {
                interfaceInfo.comments = comments;
            }

            // Is it private?
            if (matches[1] != null && matches[1].trim() == "private") {
                interfaceInfo.isPrivate = true;
            }

            // Extends other interfaces?
            if (matches[3] != null && matches[3].indexOf("extends") != -1) {
                interfaceInfo.extendsInterfaces = [];
                matches[3]
                    .split(/\sextends\s/)
                    .forEach(function(interfaceName) {
                        if (interfaceName.trim().length > 0) {
                            interfaceInfo.extendsInterfaces.push(
                                interfaceName.trim()
                            );
                        }
                    });
            }

            // Open brace?
            if (matches[7].indexOf("{") != -1) {
                this.braces++;
            }

            // Add result only if there is no existing entry
            var newEntries = [];
            var previousEntry = null;
            this.info.entries.forEach(function(existingEntry) {
                if (
                    existingEntry.interfaceName == interfaceInfo.interfaceName
                ) {
                    previousEntry = existingEntry;
                }
                newEntries.push(existingEntry);
            });
            if (previousEntry == null) {
                newEntries.push(interfaceInfo);
                this.interfacesByName[
                    interfaceInfo.interfaceName
                ] = interfaceInfo;
            }
            this.info.entries = newEntries;

            // Set current interface
            this.currentInterface = interfaceInfo.interfaceName;
            this.currentInterfaceBraces = this.braces;

            i += matchedHx.length;
        } else if (
            this.currentMethod == null &&
            (matches = hx.match(
                /^(private\s+)?typedef\s+([a-zA-Z_][a-zA-Z_0-9_<,>]*)\s*=\s*(\{|([a-zA-Z_][a-zA-Z0-9_<,>\(\):\-]*)\s*;)/
            ))
        ) {
            // Typedef
            var matchedHx = matches[0];

            // Basic info
            var typedefInfo = {
                typedefName: matches[2],
                entries: []
            };

            // Comments?
            var comments = this.getCommentsBeforeLine(
                input.substring(0, i).split("\n").length
            );
            if (comments.trim().length > 0) {
                typedefInfo.comments = comments;
            }

            // Is it private?
            if (matches[1] != null && matches[1].trim() == "private") {
                typedefInfo.isPrivate = true;
            }

            if (matches[3] != null) {
                if (matches[3].indexOf("{") == 0) {
                    // Open braces
                    this.braces++;
                } else {
                    // Type alias
                    typedefInfo.typedefType = matches[4].replace(/\s*/g, "");
                }
            }

            // Add result only if there is no existing entry
            var newEntries = [];
            var previousEntry = null;
            this.info.entries.forEach(function(existingEntry) {
                if (existingEntry.typedefName == typedefInfo.typedefName) {
                    previousEntry = existingEntry;
                }
                newEntries.push(existingEntry);
            });
            if (previousEntry == null) {
                newEntries.push(typedefInfo);
                this.typedefsByName[typedefInfo.typedefName] = typedefInfo;
            }
            this.info.entries = newEntries;

            // Set current class
            this.currentTypedef = typedefInfo.typedefName;
            this.currentTypedefBraces = this.braces;

            i += matchedHx.length;
        } else if (
            this.currentMethod == null &&
            (matches = hx.match(
                /^(extern\s+)?(private\s+)?class\s+([a-zA-Z_][a-zA-Z_0-9_]*(?:<[a-zA-Z_0-9_<,>\(\):\-]+>)?)(\s+extends\s+(([a-zA-Z_][a-zA-Z_0-9]*\.)*[a-zA-Z_][a-zA-Z_0-9]*(?:<[a-zA-Z_0-9_<,>\(\):\-]+>)?))?((\s+implements\s+(([a-zA-Z_][a-zA-Z_0-9]*\.)*[a-zA-Z_][a-zA-Z_0-9]*(?:<[a-zA-Z_0-9_<,>\(\):\-]+>)?))*)(\s*\{|\s*;)/
            ))
        ) {
            // Class
            var matchedHx = matches[0];

            // Basic info
            var classInfo = {
                className: matches[3],
                entries: []
            };

            // Comments?
            var comments = this.getCommentsBeforeLine(
                input.substring(0, i).split("\n").length
            );
            if (comments.trim().length > 0) {
                classInfo.comments = comments;
            }

            // Is it extern?
            if (matches[1] != null && matches[1].trim() == "extern") {
                classInfo.isExtern = true;
            }

            // Is it private?
            if (matches[2] != null && matches[2].trim() == "private") {
                classInfo.isPrivate = true;
            }

            // Extends another class?
            if (matches[5] != null && matches[5].length > 0) {
                classInfo.extendsClass = matches[5];
            }

            // Implements interfaces?
            if (matches[7] != null && matches[7].indexOf("implements") != -1) {
                classInfo.implementsInterfaces = [];
                matches[7]
                    .split(/\simplements\s/)
                    .forEach(function(interfaceName) {
                        if (interfaceName.trim().length > 0) {
                            classInfo.implementsInterfaces.push(
                                interfaceName.trim()
                            );
                        }
                    });
            }

            // Open brace?
            if (matches[11].indexOf("{") != -1) {
                this.braces++;
            }

            // Add result only if there is no existing entry
            var newEntries = [];
            var previousEntry = null;
            this.info.entries.forEach(function(existingEntry) {
                if (existingEntry.className == classInfo.className) {
                    previousEntry = existingEntry;
                }
                newEntries.push(existingEntry);
            });
            if (previousEntry == null) {
                newEntries.push(classInfo);
                this.classesByName[classInfo.className] = classInfo;
            }
            this.info.entries = newEntries;

            // Set current class
            this.currentClass = classInfo.className;
            this.currentClassBraces = this.braces;

            i += matchedHx.length;
        } else if (
            this.currentMethod == null &&
            (this.currentClass != null ||
                this.currentInterface != null ||
                this.currentTypedef != null) &&
            (matches = hx.match(
                /^((?:(private|static|public|override|inline|virtual|(?:@:[^\s]+))\s+)*)?function\s+([a-zA-Z_][a-zA-Z0-9_<,>:\-]*)\s*\(([^\)]*)\)(\s*:\s*((?:[a-zA-Z_][a-zA-Z0-9_]*\.)*[a-zA-Z_][a-zA-Z0-9_<,>\-]*))?(\s*\{|\s*;)/
            ))
        ) {
            // Method
            var matchedHx = matches[0];
            console.log("MATCH:", matchedHx);

            // Basic info
            var methodInfo = {
                methodName: matches[3],
                arguments: []
            };

            // Comments?
            var comments = this.getCommentsBeforeLine(
                input.substring(0, i).split("\n").length
            );
            if (comments.trim().length > 0) {
                methodInfo.comments = comments;
            }

            // Does it have modifiers?
            if (matches[1] != null) {
                // Is it static?
                if (matches[1].indexOf("static") != -1) {
                    methodInfo.isStatic = true;
                }
                // Is it private or public?
                if (
                    matches[1].indexOf("public") == -1 &&
                    this.currentTypedef == null &&
                    (this.currentClass == null ||
                        !this.classesByName[this.currentClass].isExtern)
                ) {
                    methodInfo.isPrivate = true;
                }
            }

            // Arguments
            if (matches[4] != null) {
                methodInfo.arguments = this.parseArguments(matches[4]);
            }

            // Add method info to current class, interface or typedef
            // Add it only if not existing already
            var currentEntriesHolder = null;
            if (this.currentClass != null) {
                currentEntriesHolder = this.classesByName[this.currentClass];
            } else if (this.currentInterface != null) {
                currentEntriesHolder = this.interfacesByName[
                    this.currentInterface
                ];
            } else if (this.currentTypedef != null) {
                currentEntriesHolder = this.typedefsByName[this.currentTypedef];
            }
            if (currentEntriesHolder != null) {
                var newEntries = [];
                var previousEntry = null;
                currentEntriesHolder.entries.forEach(function(existingEntry) {
                    if (existingEntry.methodName == methodInfo.methodName) {
                        previousEntry = existingEntry;
                    }
                    newEntries.push(existingEntry);
                });
                if (previousEntry == null) {
                    newEntries.push(methodInfo);
                    currentEntriesHolder.entries = newEntries;
                }
            }

            // Return type
            if (matches[6] != null) {
                methodInfo.returnType = matches[6].replace(/\s*/g, "");
            }

            // Open brace?
            if (matches[7].indexOf("{") != -1) {
                this.braces++;
                this.currentMethod = methodInfo.methodName;
                this.currentMethodBraces = this.braces;
            }

            i += matchedHx.length;
        } else if (
            this.currentMethod == null &&
            (this.currentClass != null ||
                this.currentInterface != null ||
                this.currentTypedef != null) &&
            (matches = hx.match(
                /^((?:(private|static|public|override|virtual|inline)\s+)*)?var\s+([a-zA-Z_][a-zA-Z_0-9]*)\s*(\(([^\)]*)\))?(\s*:\s*((?:[a-zA-Z_][a-zA-Z0-9_]*\.)*[a-zA-Z_][a-zA-Z0-9_<,>\-]*))?(\s*=\s*((?:"(?:[^"\\]*(?:\\.[^"\\]*)*)"|'(?:[^']*(?:''[^']*)*)')|(?:[^;]+)))?(\s*;)/
            ))
        ) {
            // Property
            var matchedHx = matches[0];

            // Basic info
            var propertyInfo = {
                propertyName: matches[3]
            };

            // Comments?
            var comments = this.getCommentsBeforeLine(
                input.substring(0, i).split("\n").length
            );
            if (comments.trim().length > 0) {
                propertyInfo.comments = comments;
            }

            // Does it have modifiers?
            if (matches[1] != null) {
                // Is it static?
                if (matches[1].indexOf("static") != -1) {
                    propertyInfo.isStatic = true;
                }
                // Is it private or public?
                if (
                    matches[1].indexOf("public") == -1 &&
                    this.currentTypedef == null &&
                    (this.currentClass == null ||
                        !this.classesByName[this.currentClass].isExtern)
                ) {
                    propertyInfo.isPrivate = true;
                }
            }

            // Type
            if (matches[7] != null) {
                propertyInfo.propertyType = matches[7].replace(/\s*/g, "");
            }

            // Default value
            if (matches[9] != null) {
                propertyInfo.defaultValue = matches[9].replace(/\s*/g, "");
            }

            // Add property info to current class, interface or typedef
            // Add it only if not existing already
            var currentEntriesHolder = null;
            if (this.currentClass != null) {
                currentEntriesHolder = this.classesByName[this.currentClass];
            } else if (this.currentInterface != null) {
                currentEntriesHolder = this.interfacesByName[
                    this.currentInterface
                ];
            } else if (this.currentTypedef != null) {
                currentEntriesHolder = this.typedefsByName[this.currentTypedef];
            }
            if (currentEntriesHolder != null) {
                var newEntries = [];
                var previousEntry = null;
                currentEntriesHolder.entries.forEach(function(existingEntry) {
                    if (
                        existingEntry.propertyName == propertyInfo.propertyName
                    ) {
                        previousEntry = existingEntry;
                    }
                    newEntries.push(existingEntry);
                });
                if (previousEntry == null) {
                    newEntries.push(propertyInfo);
                    currentEntriesHolder.entries = newEntries;
                }
            }

            i += matchedHx.length;
        } else if (
            this.currentMethod == null &&
            (matches = hx.match(
                /^(private\s+)?enum\s+([a-zA-Z_][a-zA-Z_0-9_<,>\(\):\-]*)(\s*\{|\s*;)/
            ))
        ) {
            // Enum
            var matchedHx = matches[0];
            console.log(matchedHx);
            console.log(i);
            i += matchedHx.length;

            // Basic info
            var enumInfo = {
                enumName: matches[2],
                enumValues: []
            };

            // Comments?
            var comments = this.getCommentsBeforeLine(
                input.substring(0, i).split("\n").length
            );
            if (comments.trim().length > 0) {
                enumInfo.comments = comments;
            }

            // Is it private?
            if (matches[1] != null && matches[1].indexOf("private") != -1) {
                enumInfo.isPrivate = true;
            }

            // Open brace?
            if (matches[3].indexOf("{") != -1) {
                this.braces++;
            }

            // Add result only if there is no existing entry
            var newEntries = [];
            var previousEntry = null;
            this.info.entries.forEach(function(existingEntry) {
                if (existingEntry.enumName == enumInfo.enumName) {
                    previousEntry = existingEntry;
                }

                newEntries.push(existingEntry);
            });

            // console.log(this.info.entries);

            if (previousEntry == null) {
                newEntries.push(enumInfo);
                this.enumsByName[enumInfo.enumName] = enumInfo;
            }
            this.info.entries = newEntries;

            // Set current enum
            this.currentEnum = enumInfo.enumName;
            this.currentEnumBraces = this.braces;
        } else if (
            this.currentMethod == null &&
            this.currentEnum != null &&
            (matches = hx.match(
                /^([a-zA-Z_][a-zA-Z_0-9]*)\s*(\(([^\)]*)\))?(\s*;)/
            ))
        ) {
            var matchedHx = matches[0];

            var valueInfo = {
                valueName: matches[1]
            };

            if (matches[3] != null) {
                valueInfo.valueArguments = this.parseArguments(matches[3]);
            }

            const values = this.enumsByName[this.currentEnum].enumValues;

            if (!values.find(e => valueInfo.valueName === e.valueName)) {
                values.push(valueInfo);
            }

            i += matchedHx.length;
        } else if (
            (hx.charAt(0) == "'" || hx.charAt(0) == '"') &&
            ((REGEX_QUOTED_STRING.lastIndex = -1) &&
                (matches = hx.match(REGEX_QUOTED_STRING)))
        ) {
            i += matches[0].length;
        } else if (hx.charAt(0) == "{") {
            // Open brace
            this.braces++;
            i++;
        } else if (hx.charAt(0) == "}") {
            // Close brace
            this.braces--;
            if (
                this.currentMethod != null &&
                this.braces < this.currentMethodBraces
            ) {
                this.currentMethod = null;
                this.currentMethodBraces = 0;
            } else if (
                this.currentClass != null &&
                this.braces < this.currentClassBraces
            ) {
                this.currentClass = null;
                this.currentClassBraces = 0;
            } else if (
                this.currentInterface != null &&
                this.braces < this.currentInterfaceBraces
            ) {
                this.currentInterface = null;
                this.currentInterfaceBraces = 0;
            } else if (
                this.currentEnum != null &&
                this.braces < this.currentEnumBraces
            ) {
                this.currentEnum = null;
                this.currentEnumBraces = 0;
            } else if (
                this.currentTypedef != null &&
                this.braces < this.currentTypedefBraces
            ) {
                this.currentTypedef = null;
                this.currentTypedefBraces = 0;
            }
            i++;
        } else if ((matches = hx.match(/^#(if|else|end)([^\n]*)\n/))) {
            // Preprocessor
            i += matches[0].length;
        } else {
            i++;
        }
    }
};

HXParser.prototype.getCommentsBeforeLine = function(lineNumber) {
    var lines = [];
    while (this.comments.length > 0 && this.comments[0].line < lineNumber) {
        var comment = this.comments[0];
        this.comments.shift();
        comment.text.split("\n").forEach(function(line) {
            lines.push(line);
        });
    }
    return lines.join("\n");
};

HXParser.prototype.parseArguments = function(input) {
    var i = 0;
    var matches = null;
    var arguments = [];
    input = input.replace(/\s+/g, "") + ",";

    while (i < input.length) {
        var hx = input.substring(i);

        if (
            (matches = hx.match(
                /^(\?\s*)?([a-zA-Z_][a-zA-Z_0-9]*)\s*(:\s*([a-zA-Z_][a-zA-Z0-9_<,>\-]*))?(\s*=\s*([^,]+))?\s*,/
            ))
        ) {
            matchedHx = matches[0];

            // Basic info
            var argumentInfo = {
                argumentName: matches[2]
            };

            // Is it optional?
            if (matches[1] != null && matches[1].indexOf("?") != -1) {
                argumentInfo.isOptional = true;
            }

            // Type information
            if (matches[4] != null) {
                argumentInfo.argumentType = matches[4].replace(/\s*/g, "");
            }

            // Default value
            if (matches[6] != null) {
                argumentInfo.defaultValue = matches[6].replace(/\s*/g, "");
            }

            arguments.push(argumentInfo);

            i += matchedHx.length;
        } else {
            i++;
        }
    }

    return arguments;
};

module.exports = HXParser;
