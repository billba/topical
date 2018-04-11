"use strict";

class Foo {
    constructor(foo) {
        this.foo = foo;
    }

    static create() {
        new this(5);
    }
}

class Bar extends Foo {
    constructor(foo) {
        super(foo);
        this.bar = "bar";
    }
}

console.log(new Bar());