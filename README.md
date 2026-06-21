# Goa

Goa is a small expression-based programming language, designed to be lightweight and easy for people to understand and learn. It uses a clean, parentheses-driven syntax inspired by languages like Lisp. It deals exclusively with numbers, allowing for people to experiment with logic and automate tasks that deal with integers. 

## Goa's goals

Goa is designed to be
 - easily understandable
 - predictable
 - expandable

Goa is open-source, and allows for easy changes to code for your needs. 

## Important features
 - All functions have either 1 or 2 arguments inside parentheses, making it easy to understand and remember what functions do.
 - ```IF, ELSE IF, ELSE, WHILE, and REPEAT``` blocks all have ```END``` markers to make it clear where they end.
 - Goa ignores whitespace and formatting like indentation.
 - Goa is safe and deterministic, as rules are strict to allow for no unpredictability.
 - Complete with browser saving and file downloading and uploading.

## Function examples
### Variables
```SET (x 10)```

### Input
```SET (x INPUT)```

### Output
```RETURN (14)```

### Math
```MULT (5 2)```

### Base conversion
```BASE (10, 2)```

### Conditionals
```
IF (x = 1)
RETURN (ADD (2 3))
END

ELSE
RETURN (10)
END
```

### Loops
```
REPEAT (times)
SET (x ADD (x 1))
END
```

### Comments
```# This is a comment!```

## Example program
The following program takes multiple numbers and converts them to binary

```
START

SET (times INPUT)

REPEAT (times)
RETURN (BASE (INPUT 2))
END

END
```

## Getting started
To get started with Goa, visit: <a href="https://goalang.vercel.app/">goalang.vercel.app</a>